# Finance — Banking & Credit Unions

> Retail banks, commercial banks, and credit unions. Common themes: regulatory compliance (BCBS 239, FDIC, Basel III), Customer 360, AML, post-merger data consolidation.

---

*12 customers*

### Affinity Plus

**About:** Affinity Plus Federal Credit Union offers full service personal and business banking: checking and savings accounts, loans, credit cards, and more.

| Field | Value |
|---|---|
| **Products** | DQ, MDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

Affinity Plus is the largest Credit Union serving Minnesota, supporting 278,000 members with 600 employees across 33 branches. They have over $4b in Assets under Management. With such a large footprint, it is important that Affinity maintain clean, deduplicated customer data to ensure they are providing high levels of service. This emphasis on services has lead to an organization wide data moderization effort, centered around a move to a technology stack including Amazon Web Services and Databricks. 

In making this change, they realized there was no easy way to profile data to gain insights on quality. Furthermore, they were manually writing Data Quality rules and lacked any overarching data governance regime. In order to solve this, they acquired Ataccama MDM to centrally manage customer golden records. They have Critical Data Elements defined in Ataccama and pushed into downstream systems. Data Quality checks are done on data coming from AWS S3 buckets before it lands into core banking systems. This has become the backbone for operational and regulatory reporting.

---

### Associated Bank.

**About:** Associated Banc-Corp is a U.S. regional bank holding company ($42B under management) providing retail banking, commercial banking, commercial real estate lending, private banking and specialized financial services. Headquartered in Green Bay, Wisconsin, Associated is a Midwest bank with from more than 220 banking locations serving more than 100 communities throughout Wisconsin, Illinois and Minnesota. The company also operates loan production offices in Indiana, Michigan, Missouri, New York, Ohi

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Credit Risk |

**Proof Point:**

Leader of risk management in the company was pulled in to fix what was deemed a failed data governance program.  As the bank crosses over to $50B under management, they are working to be ready for increased regulations and recent audits have showed gaps in their processes, data quality integrity and overall data governance.  They had previously implemented IBM Cloud Pack for Data, which had a number of security obstacles and they were never able to fully get the system up.  They have ripped it out  now to put in place Ataccama for their catalog and DQ.  They need lineage are frustrated with the Manta integration so looking forward to move to Ataccama lineage when it is ready.  They call their business stakeholders 'oracles' that deem to know everything about the data but can be quite stuck in old ways of doing things so the DG team is working to build stable processes and systems to take things into the future.  The goal with Ataccama is to show the data with integrity, documented evidence, and regular real-time quality checks that can be relied on.  Business iniatiaves include AI readiness for things like fraud, investor reporting and HSA department.  Household growth is another large stated objective.  Also very interested in MDM down the road to support their M&A goals.

---

### Citizens Bank

**About:** Citizens Bank is the 14th biggest bank in the US with 1,100 branches across 14 states and over $13B in annual revenue.

| Field | Value |
|---|---|
| **Products** | DQ, RDM |
| **Business Initiative(s)** | Customer 360 |

**Proof Point:**

Since 2018, Citizens Bank has been leveraging Ataccama DQ to solve for fragmented customer and financial data across the enterprise. 70% of their data was in legacy mainframe systems and oracle systems. They modernized their data architecture. moved away from manual data quality checks by running DQ jobs into Ataccama to bring clean data into upstream systems (SFDC, touchpoint) for consumption. They started with customer operations team and leveraged the power of Ataccama for customer segmentation so they can customize products / services for right segment.

---

### Fifth Third Bank

**About:** Fifth Third Bank is the 15th biggest bank in the US with 1,000 branches across 11 states and $12B in annual revenue.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Regulatory Compliance Reporting, Operational Reporting, Financial Crime & AML, Credit Risk |

**Proof Point:**

Since 2018 Fifth Third have been leveraging Ataccama for all high risk, including BCBS239 / BASEL III and Federal Deposit Insurance (FDIC) regulatory reporting use cases. Fifth Third mapped the data supply chains for the top 1,100 CDE’s across the bank and use Ataccama to ensure that all of these have DQ rules implemented on them and are being actively monitored and certified. They have over 115 direct users of Ataccama, and 80 more who receive the DQ monitoring output from the platform that ensuring the accuracy & availability of these CDE’s [quality and availability of CDEs for regulatory purposes or something else?]. There are 20 source systems where we do automated DQ checks. Fifth Third's approach has focused on building trust and confidence in the data with the data consumers. Data ingested into multiple aggregation systems including a Snowflake data warehouse, a Finance & Risk Management mart and a Commercial Banking mart, all of which have active DQ rules & monitoring from Ataccama. [so there are DQ checks on the way into Snowflake, the Finance and Risk Management mart and a Commercial Banking mart? Who monitors these quality checks - the end users or the Enterprise Data team?]

---

### KB Bank (Societe Generale)

**About:** Komercni Bank is a financial insutution in the Czech Republic. Komercni offers deposit account and consumer lending to individual and business customers.

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Customer 360 |

**Proof Point:**

In 202X Ataccama was chosen as the DQ tool to support the replacement of KBs existing data platform, integrating data from 17 sources, covering 12 million customer profiles and addresses to overcome data challenges, delivering reliable and actionable insights to enhance customer services and operational efficiency. [doesnt' KB bank services ~12 African countries? - why does data need to be shared between entities]

Ataccama’s solution enhances data accuracy, combining information across all entities within the banking group and supporting real-time access to reliable customer data. This data hub enables KB Bank to enhance services, streamline operations and drive data-driven decision-making to improve customer experience.

Ataccama also enables KB to improve prospect identification by matching customer information against public registries and centralises consent management to ensure legal compliance [to what?] across all departments.

---

### Lloyds Banking Group (LBG)

**About:** Lloyds Banking Group is a UK-based financial services company formed from the merger of HBOS and Lloyds TSB in 2009. Lloyds Banking Group is headquartered in London and has several locations spread throughout the UK, along with operations in the US, Europe, the Middle East, and Asia. The main services offered by Lloyds Banking Group are Retail Banking; Commercial; Life, Pensions & Insurance; and Wealth & International. Lloyds Banking Group is also listed on the London and New York stock exchange

| Field | Value |
|---|---|
| **Products** | DQ, MDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

Since 2019 Lloyds Banking Group has been leveraging Ataccama DQ&C to monitor risk reporting metrics in order to meet mandatory BCBS239 regulation. Business term and regulatory metrics are imported from Collibra, automatically processed against DQ rules in Ataccama, then BCBS239 metrics are calculated and used to complete the mandatory regulatory reports. These are then exported via Tableau. As a result of our successful implementation of this program, Ataccama was selected in 2020 to become the enterprise-wide Data Quality tool across the bank's divisions, including mortgages, insurance, payments, financial fraud, retail and commercial banking, as well as central group functions. Ataccama is used for the management and control of ~600 CDEs and used by over 400 users across the bank.

---

### Penfed Credit Union

**About:** Established in 1935, Pentagon Federal Credit Union is a member-owned financial cooperative. They are headquartered in McLean, Virginia, with locations throughout the area.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Operational Reporting, Regulatory Complaince Reporting |

**Proof Point:**

Penfed grew via aquistions over time and it created massive data consolidation problem for them. Part of the solution was Snowflake, which is PenFed's EDW and it consolidates data from variety of sources - legacy and modern both. Ataccama DQ engine provides data accuracy by running rules on information so the right information lands into business systems (primarily SFDC). We also do data remediation at the source level. They have got complex DQ rules running at every level to ensure data is consistent and accurate. They also run daily profiling to ensure no important fields are missing in the Snowflake data.

Impact - It enables Penfed to ensure consistent information is being shared with commercial and contact center agents. It also enables with accurate reporting as Snowflake data feeds into Tableau

Updated use case (work in progress):
PenFed has been using Ataccama for Data Quality (DQ) since 2023 to ensure the accuracy and consistency of member and financial data, supporting regulatory compliance and operational efficiency. This implementation is crucial for reducing data inconsistencies, improving decision-making, and enhancing member experience.
Since early 2024, PenFed has been expanding its usage of DQ to include additional business units and data domains, aiming to create a unified approach to data quality management across the organization.
We have also initiated discussions around implementing a data catalog and governance framework to replace their current manual processes. The goal is to establish a centralized repository for metadata, improve data lineage visibility, and define Critical Data Elements (CDEs) to enhance overall data governance and compliance efforts.

---

### Provident Bank (formerly known as Lakeland Bank)

**About:** Provident Bank is a community-oriented bank offering financial services across New Jersey, Pennsylvania, and New York. With a strong focus on community, they serve businesses, individuals, and families with a broad array of deposit, loan, and investment products.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM, Lineage |
| **Business Initiative(s)** | Regulatory Compliance, New Core Systems & Migrations |

**Proof Point:**

Provident Bank is pursuing a broad strategy of digital modernization and regulatory readiness. They are using the migration of their core banking system from FIS Horizon to the more scalable FIS IBS Platform as a compelling event to build a clean and modern data foundation. This effort is not just about a system switch; it's a ""start from scratch"" approach to create a scalable and flexible technology landscape. The bar is high, as they must ensure high data integrity in order to prepared for future regulatory audits from regulators like FDIC. 

As part of this transition, they must manage the complexity and misalignment created by the recent merger with Lakeland. Ataccama was a central Data Management solution at Lakeland and was brought over to Provident. As such, this project serves as an opportunity for Ataccama to position ourselves as the central foundation for Provident's future data ecosystem. The core systems at each bank (Horizon and FIServe) didn't integrate natively, and previous data sources from Lakeland were no longer applicable. This created a complex, siloed data environment that needed to be consolidated. A core banking migration in any instances introduces significant data migration risks, as inconsistent and unreliable data — such as incorrect phone numbers, emails, and obsolete records—need to be identified and cleaned to avoid quality issues in the new system. On top of this, the combined entity needed to navigate an underdeveloped data governance foundation, particularly from the Lakeland side. Without established governance, Provident was not yet under the purview of compliance scrutiny, but they recognized this was a ticking time bomb as regulatory pressures, especially from the FDIC, were expected to increase. 

Ataccama is being used as the core data quality and governance platform to address these challenges. The bank is leveraging Ataccama to build a central data warehouse in a SQL Server environment. Within this new structure, Ataccama helps build staging tables and map incoming data from IBS, centralizing it for unified access. The goal is to retain familiar data use cases while improving the overall structure. Additionally, Ataccama is being implemented to build the future data governance foundation, providing the necessary controls and policies to meet anticipated regulatory scrutiny and establish trust in their data.

While the full impact of the migration and the new data governance foundation is yet to be realized, the effort is on a tight timeline to be completed by September 2026. The migration is seen as a success, having created a streamlined process for data migration and governance that will form the new "business as usual" after the Go-Live date.

---

### Raiffeisen

**About:** A universal bank is operating in 24 countries and was established on the Czech market in 1993 as a member of Austrian Raiffeisen Group, owned by Raiffeisen Bank.

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Customer 360, Regulatory Compliance Reporting |

**Proof Point:**

Raiffesen was growing exponentially and one of the strategies it used was acquiring smaller banks in the region. To support its acquisition growth it needed a tool to merge customer data into a single system. They needed to consolidate client portfolios with the goal of preventing customer duplication and preparing the consolidated portfolio for cross-selling.        

Attempting to prevent duplication of customer data across three recently integrated banks, Raffesen was facing data chaos. It had no single source of truth, causing overall lack of trust in data. To support the M&A strategy while keeping compliant with strict regulatory targets they started looking for a mature tool to automate data consolidation and allow Customer 360 view.        

Raiffeisen partnered with Ataccama in 2007 to establish an MDM hub to achieve a single customer view with full information from all consolidated systems. Customer records are propagated to the enterprise data warehouse daily and enable full GDPR compliance. This includes identifying client information in all systems and supporting the right for erasure. Beyond regulation, the bank relies on deduplicated customer records to decrease costs and improve the efficiency of its marketing activities.The web services incorporate a number of external registries and blacklists for validating addresses and legal entities, as well as detecting relationships between persons. MDM worked in batch and online modes. In batch mode, the MDM hub consolidates nearly 6 million records from 20 source systems, of which 4 are also processed in near real-time mode. Tailored datasets are then provided to the enterprise data warehouse for consumption by the whole organization, while following strict security policies.

The bank relies on deduplicated customer records to display correct account information to the customers (acounts they have, savings, credit cards, etc), to decrease internal costs and improve the efficiency of its marketing activities. All of this is directly supporting the combination of EU and Czech National Bank regulations they must comply with.

---

### Stater

**About:** Stater is an end-to-end service provider for the mortgage market. Stater supports more than 35 mortgage providers in handling and securing mortgage portfolios internationally. The Stater Mortgage System processes over one million mortgage loans. Stater is an international player with more than 450 employees. The head office is located in Amersfoort, the Netherlands. Next to that Stater has offices in Bonn, Germany and Brussels, Belgium.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Customer 360 |

**Proof Point:**

Stater is the leading mortgage service provider in Netherlands. Since becoming a majority-owned subsidiary of Infosys in 2019, Stater has focused on digital transformation, data-driven services, and innovation in mortgage processing. Stater has a goal to provide a better service to their customers and help them be more data driven. They collaborate with financial institutions to develop new tailored mortgage products. To create a more compelling offering they needed to offer a modern end to end mortgage platform powered by quality data and providing a best in class digital experience. 

As part of this offering, Stater created variety of data products serving data from their Data Lake directly to customers, some offered for free and some as additional paid service. These included a business glossary, product catalog, data catalog and data quality insights. Originally all of there data products were built on information based on Excel and uploaded back and forth between Stater and its customers, a foundation that was difficult to manage effectively.

Ataccama was brought in to help power a "Data Quality as a Service" offering that monitors and measures data on behalf of Stater customers. This product primarily targets external lenders and is offered as a subscription delivered in a multi-tenant environment. Data is sent to Stater to be checked for inaccuracy or incompleteness. Stater surfaces the outputs in a Data Quality Dashboard available through the Stater Portal. Key components of the dashboard include a high level compliance overview, a campaign dashboard, annual and monthly trend lines, error details, and a DQ filter enabling the user to toggle between selected rules. The dashboard provides customers visibility into all of theird data products along with associated metadata and multilingual definitions. It monitors their critical data and helps improve data quality relevant for European Union compliance requirements. 

This product, offered for a fee, has a direct impact on topline revenue for Stater. It also enhances the experience for the customers, improving retention and customer satisfaction.

---

### Truist

**About:** Truist is an American Banking Corporation that was founded in 2019 after the merger of SunTrust Bank and BB&T. Truist manages $500B in assets and had ~$30B in revenue in 2023.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Operational Reporting |

**Proof Point:**

After the merger Truist faced a monumental task to consolidate data across both organizations, gain visibility into their CDE's and ensure high data quality standards through the organization. After deploying Informatica for years, they were not able to get to an Enterprise Wide deployment through their Data Governance strategy and decided to bring on Ataccama as the platform of choice to achieve these milestones.

Truist has identifed 11,000 CDEs across 8 business units (Consumer and Small Business Banking, Enterprise Operational Services, Enterprise Payments, Enterprise Technology, Finance Group, Human Resources, Risk Managament Organization, and Wholesale Banking). Across these 8 business units the CDEs are housed in 16 data sources/warehouses. The customer is deploying 7 dimensions of rules across these 11,000 CDEs which includes: Accuracy, Validitaty, Completeness, Consistency, Uniqueness, Timeliness, and Integrity. 

Ataccama connects to all of their data sources to provide a complete catalog of their data - they are migrating their existing IDQ rules over to our system and applying those new rules across their CDEs. 

The first phase will consist of at least 1 rule dimension being checked against each CDE resulting in 11,000 CDE Dimension checks. The next phase will involve rolling all 7 dimension rule checks across each CDE resulting in 77,000 rule checks within Ataccama. This will also provide a single source of truth to understand what dimensions on their CDE are consistently failing checks on a continuous 3-month basis to flag for internal review to the business owners.

---

### Zions Bank

**About:** Zions First National Bank is a subsidiary of Zions Bancorporation which operates through over 500 offices and 600 ATMs in 10 Western states: Arizona, California, Colorado, Idaho, Nevada, New Mexico, Oregon, Texas, Utah and Washington. As a full-service bank, Zions offers commercial, installment and mortgage loans; trust services; foreign banking services; electronic and online banking services; automatic deposit and nationwide banking and transfer services; as well as the more familiar checking 

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Customer 360 |

**Proof Point:**

Zions is leveraging Ataccama as their Enterprise RDM, which helps the bank streamline its RDM and provide real-time discovery and aid in Zions Data Governance management. RDM enables Zions to keep reference data accurate and consistent.  Reference data is used for data validation (e.g. state codes) and to standardize data across applications/systems. Zions EDW applications depend on the reference codes in Ataccama for accurate real time reporting and analysis. 

Zions also embarked on a DQ journey with us in Q2 2024 to run data quality checks for their customer information before it gets consumed by business. DQ rules in Ataccama ensure data is consistent : e.g - No two Customer Numbers should be alike; Postal Code must be populated and cannot begin with characters such as &, %, @, nor commas; A Customer must not have two Customer IDs associated with one Tax ID etc.

The outcome is data consistency for customer master information

---
