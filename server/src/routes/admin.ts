import { Router, Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { query } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { AuthenticatedRequest, ok, err } from '../types/index.js';
import {
  importKnowledgeBase,
  reimportProofPointFile,
  readKbFile,
  writeKbFile,
  listKbFiles,
  isValidKbFilename,
} from '../services/kbImportService.js';

const router = Router();
const auth = requireAuth as unknown as (req: Request, res: Response, next: () => void) => void;

// Max 2MB per KB file — largest current file is ~27KB, gives huge headroom.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function kbDir(): string {
  return path.resolve(process.cwd(), 'kb');
}

function requireManager(req: Request, res: Response): boolean {
  const user = (req as AuthenticatedRequest).user;
  if (user.role !== 'manager') {
    res.status(403).json(err('Manager role required'));
    return false;
  }
  return true;
}

// POST /admin/kb/import — re-import all KB markdown files into the database
router.post('/kb/import', auth, async (req: Request, res: Response): Promise<void> => {
  if (!requireManager(req, res)) return;

  try {
    const result = await importKnowledgeBase(kbDir());
    res.json(ok(result));
  } catch (error) {
    console.error('KB import error:', error);
    res.status(500).json(err(`KB import failed: ${(error as Error).message}`));
  }
});

// GET /admin/kb/status — check current KB state
router.get('/kb/status', auth, async (_req: Request, res: Response): Promise<void> => {
  const [ppCount, diffCount, importLog] = await Promise.all([
    query<{ count: string }>('SELECT COUNT(*)::text AS count FROM kb_proof_points', []),
    query<{ count: string }>('SELECT COUNT(*)::text AS count FROM kb_differentiators', []),
    query<{ file_name: string; record_type: string; record_count: number; imported_at: string }>(
      'SELECT file_name, record_type, record_count, imported_at FROM kb_import_log ORDER BY imported_at DESC',
      []
    ),
  ]);

  res.json(ok({
    proof_points: parseInt(ppCount[0]?.count ?? '0'),
    differentiators: parseInt(diffCount[0]?.count ?? '0'),
    import_log: importLog,
  }));
});

// GET /admin/kb/files — list all KB files on disk with metadata and DB join
router.get('/kb/files', auth, async (req: Request, res: Response): Promise<void> => {
  if (!requireManager(req, res)) return;

  try {
    const files = listKbFiles(kbDir());

    // Join with DB counts + last import per file.
    const dbCounts = await query<{ source_file: string; customer_count: string }>(
      `SELECT source_file, COUNT(*)::text AS customer_count
       FROM kb_proof_points
       WHERE source_file IS NOT NULL
       GROUP BY source_file`,
      []
    );
    const countsByFile = new Map(dbCounts.map(r => [r.source_file, parseInt(r.customer_count)]));

    const lastImports = await query<{ file_name: string; imported_at: string; record_count: number }>(
      `SELECT DISTINCT ON (file_name) file_name, imported_at, record_count
       FROM kb_import_log
       ORDER BY file_name, imported_at DESC`,
      []
    );
    const importByFile = new Map(lastImports.map(r => [r.file_name, r]));

    const enriched = files.map(f => ({
      ...f,
      customer_count: countsByFile.get(f.file_name) ?? 0,
      last_imported_at: importByFile.get(f.file_name)?.imported_at ?? null,
      last_imported_count: importByFile.get(f.file_name)?.record_count ?? null,
    }));

    res.json(ok(enriched));
  } catch (error) {
    console.error('[kb files] error:', error);
    res.status(500).json(err(`Failed to list KB files: ${(error as Error).message}`));
  }
});

// GET /admin/kb/files/:filename — download raw markdown for one file
router.get('/kb/files/:filename', auth, async (req: Request, res: Response): Promise<void> => {
  if (!requireManager(req, res)) return;

  const fileName = req.params.filename;
  if (!isValidKbFilename(fileName)) {
    res.status(400).json(err('Invalid filename'));
    return;
  }

  try {
    const content = readKbFile(kbDir(), fileName);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  } catch (error) {
    res.status(404).json(err((error as Error).message));
  }
});

// POST /admin/kb/files/:filename — upload markdown, validate, replace on disk, re-import
// Accepts multipart/form-data with a single file field "file", OR a raw body with
// Content-Type text/markdown. Only re-imports proof-point files; differentiators and
// index.md write to disk but are not auto-imported (caller should hit /kb/import).
router.post('/kb/files/:filename', auth, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!requireManager(req, res)) return;

  const fileName = req.params.filename;
  if (!isValidKbFilename(fileName)) {
    res.status(400).json(err('Invalid filename'));
    return;
  }

  // Accept either multipart upload or raw markdown body.
  let content: string | null = null;
  if (req.file) {
    content = req.file.buffer.toString('utf-8');
  } else if (typeof req.body === 'string') {
    content = req.body;
  } else if (req.body && typeof (req.body as { content?: string }).content === 'string') {
    content = (req.body as { content: string }).content;
  }

  if (!content) {
    res.status(400).json(err('No content provided — send a multipart file field "file" or a JSON body with {content: "..."}'));
    return;
  }

  // Reject empty or absurdly small uploads.
  if (content.trim().length < 30) {
    res.status(400).json(err('Uploaded content is too short — did you mean to upload an empty file?'));
    return;
  }

  const isProofPoint = fileName !== 'index.md' && !fileName.includes('differentiator');

  try {
    // Write disk first (atomic), then re-import if it's a proof-point file.
    writeKbFile(kbDir(), fileName, content);

    if (isProofPoint) {
      const result = await reimportProofPointFile(kbDir(), fileName);
      res.json(ok({
        file_name: fileName,
        kind: 'proof_point',
        written_bytes: Buffer.byteLength(content, 'utf-8'),
        imported: result.imported,
        deleted: result.deleted,
        parsed_customers: result.parsed_customers,
      }));
    } else {
      // Non-proof-point files (index.md, differentiators) — disk updated only.
      // Differentiators need the full /kb/import to pick up because their parser
      // reads the file alongside the positioning/mapping sections that live in
      // the same file.
      res.json(ok({
        file_name: fileName,
        kind: fileName === 'index.md' ? 'index' : 'differentiator',
        written_bytes: Buffer.byteLength(content, 'utf-8'),
        note: 'Disk updated. Run POST /admin/kb/import to reimport differentiators or index metadata.',
      }));
    }
  } catch (error) {
    console.error('[kb upload] parse/import error:', error);
    res.status(400).json(err(`Upload rejected: ${(error as Error).message}`));
  }
});

export default router;
