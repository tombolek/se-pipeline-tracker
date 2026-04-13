# Other Verticals — Technology, Energy, Retail & Public Sector

> Software companies, energy utilities, retail, government, and other verticals. Common themes: operational DQ, regulatory compliance, digital transformation, PII scanning at scale, core system migrations.

---

*12 customers*

### Auburn University

| Field | Value |
|---|---|
| **Products** | MDM, RDM, DQ |
| **Business Initiative(s)** |  |

**Proof Point:**

DQ: Increase data accuracy and security: security classes and permissioning regarding faculty and staff, strip security permissions from someone who has not been paid in a year and create policy around when rule would kick in. 

RDM: Their Institutional Research Team (IRT) are consumers of data from other teams. They have been handling the DQ issues and it's not really what they should be spending their time on. Take the reference data that their team uses and utilize in RDM resulting in more accurate data, reduction in resource hours addressing data issues thereby allowing IRT to focus on funding

MDM: HR researches duplicate id's every day and goes into Banner: takes up to 6 hours. By utilizing MDM, Ata could cut it down to minutes. CIO is concerned about users being able to access data and they don't know what they're using it for. i.e. download data from Salesforce onto their laptop. With MDM, they can increase data security and prevent fraud.

---

### CEZ

**About:** Skupina ČEZ is a conglomerate of companies that is involved in the generation, distribution, trade, and sales of electricity, heat, natural gas, and coal extraction. It operates in multiple countries in Central and Eastern Europe and Turkey.

| Field | Value |
|---|---|
| **Products** | MDM, RDM, DQ |
| **Business Initiative(s)** | New Core Systems & Migrations, Regulatory Compliance |

**Proof Point:**

CEZ is one of the largest companies in the Czechia, the single largest public company, and a leading energy group operating in Western and Central Europe. It is structured as a conglomerate of 96 companies, with a mission to ensure safe and reliable energy for its customers and the society at large. CEZ belongs to the critical infrastructure of the CZ Government and therefore needs to comply with strict data requirements. Vast volumes of data, and its subsequent quality, directly impact their regulatory obligations, the service they provide to their customers, and their internal operations.	

CEZ was facing several different issues before Ataccama. Data was spread across different locations and disparate systems with no centralized approach. Furthermore, there was a general lack of trust in data for internal reporting and regulatory purposes. All of this led to different business initiatives including the creation of a "master business partner" project that needed a tool to help master the partner ID's.

CEZ purchased Ataccama MDM as their business critical system that consolidates business data being created at physical customer branches. Our MDM system mainly consists of SAP data. After their SAP upgrade, CEZ saw the need to implement “master business partner list” that distributed partner IDs to other core systems. As a result of a successful first project, our MDM has become a hub to consolidate business data and SAP vertical systems organization wide. This integrated model slowly has been rolled out to other consumer systems at the company. Beyond MDM, we also implemented RDM focused on measurement data consolidation. This reference data is securely provided to users while every division is able to control their own data.

Over time, Ataccama MDM became the most critical business process in CEZ as it directly ties to customer service, customer onboarding, customer billing etc. There has been a large improvement in how client data is managed, reporting accuracy, and general availability of trusted data in client facing process as well as internal systems including processes tied the finance and revenue.

---

### City of Winnipeg, MB

**About:** Founded in 1873, the City of Winnipeg is the capital of the Canadian province of Manitoba. Its heart is The Forks, a historic site at the intersection of the Red and Assiniboine rivers, with warehouses converted to shops and restaurants, plus ample green space dedicated to festivals, concerts, and exhibits. Nearby, the Exchange District is known for its well-preserved, early 20th-century architecture and numerous art galleries.

| Field | Value |
|---|---|
| **Products** | DQ, MDM |
| **Business Initiative(s)** | Operational Reporting |

**Proof Point:**

The City of Winnipeg is the capital and largest city in Manitoba, Canada, and serves as a major hub for various industries and a provider of extensive municipal services to its diverse population. As a municipal government, the City of Winnipeg is responsible for delivering essential services such as public works, transportation (Winnipeg Transit), water and waste management, emergency services (Winnipeg Fire Paramedic Service, Winnipeg Police Service), planning and development, and property assessment and taxation. The City is committed to fostering a vibrant, healthy, and inclusive environment for its residents and businesses, guided by strategic plans focused on economic development, sustainability, social well-being, and continuous improvement in service delivery.

Winnipeg faced significant challenges tracking business changes across Manitoba and sharing this critical information between the City of Winnipeg and the provincial government. Specifically, they struggled with updating business numbers, identifying new business creations (corporations, companies, vendors), and ensuring this data was consistently shared with Federal, Provincial, and Municipal governments. This made tax collection from new or updated businesses inefficient due to fragmented and inconsistent data, compounded by missing postal codes or mailing addresses for various entities.	

Ataccama is used to match businesses for centralized, mass data management, allowing the identification of new businesses and changes to existing ones. If business data is not available internally, the system facilitates requests to Manitoba Business Link for new business creation. Data Quality Issue Tracking is used to schedule daily tasks, ensuring continuous data validation. MDM is are crucial for cleansing, matching, and merging property addresses, creating a common entity for various departments like Assessment for property tax and the City of Winnipeg's address database. The native Canada Post library is utilized for address validation, and Ataccama ONE serves as the authoritative source for corrected data, with DQIT routing incorrect data to department users for remediation, ultimately streamlining tax collection and ensuring accurate property information across departments.

---

### Cleanaway

| Field | Value |
|---|---|
| **Products** | MDM, DQ |
| **Business Initiative(s)** |  |

**Proof Point:**

Cleanaway's Data Challenges Before Ataccama
Data Silos and Fragmentation:
They ingest data from over 30 different sources, indicating a highly fragmented data landscape.
This likely led to inconsistencies, duplicates, and a lack of a single, unified view of customer data.
Lack of a Single Customer View:
The need to integrate data with Salesforce (their future master customer record) and JDE (their ERP system) highlights the absence of a consolidated customer view.
The customer data definition was not fully aligned internally, which is a big issue when attempting to create a single customer view.
Data Quality Issues:
The requirement for automated deduplication and survivorship rules indicates significant data quality problems, such as duplicate records and inconsistent data.
The successes they have had with Ataccama, with identifying data quality patterns, implies that those patterns were present before implementation.
Hierarchy Management Complexity:
Managing multi-regional sites and organizational hierarchies, including billing, was a complex challenge.
They needed a solution to handle these hierarchical relationships effectively.
Integration Challenges:
Integrating data from numerous disparate systems, and the need for real-time integration with Salesforce and streaming integration with JDE, presented significant technical challenges.
Data Governance:
The need to ensure data governance rule adherence shows that there was a lack of consistent application of data governance before.

Ataccama Use Case and Successes
Ataccama Use Case:
Cleanaway is using Ataccama MDM to create a "golden record" for customer data.
The system integrates data from four key sources, including Salesforce, and pushes the mastered data to their ERP systems.
The primary use case is mastering account data (customer data), including customer names, site locations, and contact details.
Ataccama is also being used for hierarchy management to provide a top-level view of customer records.
The input of the data is a push method, rather than a pull method.

Successes:
Identifying Data Quality Patterns: Cleanaway has successfully used Ataccama to identify and understand patterns in their data quality issues.
Ensuring Data Governance Rule Adherence: They are now able to track and enforce data governance rules, improving overall data compliance.
Tracking and Prioritizing Issues: Ataccama has enabled them to track and prioritize data quality issues, assigning tasks to data stewards for resolution.
Improved Data Stewardship: With 24 data stewards working on tasks raised by MDM, they have enhanced their data stewardship capabilities.

---

### Gartner

**About:** Founded in 1979, Gartner, Inc. is an information technology research and advisory firm providing insights, advice, and tools for leaders in IT, finance, HR, customer service and support, legal and compliance, marketing, sales, & supply chain functions across the world. The company is headquartered in Stamford, Connecticut.

| Field | Value |
|---|---|
| **Products** | DQ, RDM, MDM |
| **Business Initiative(s)** |  |

**Proof Point:**

Work in progress:
Gartner is focused on improving data quality and efficiency within a market research and management consulting organization. Their business challenges include a lack of transparency in data quality, difficulty accessing data profiling analysis and dashboards, and a need for better integration of operational data with reporting tools. They aim to empower users by leveraging AI and web interfaces for easy access to actionable data.
The organization is working on a Master Data Management (MDM) initiative, replacing an in-house solution with a modern cloud-ready MDM that features low-latency processing, real-time capabilities, and flexibility for integrating with major domains such as contacts, accounts, and enterprises.
To address data pains such as poor quality, lack of trust, and issues with disparate sources and bad data entry practices, they are leveraging Ataccama’s AI capabilities for anomaly detection, automated corrections, and data validation. They plan to expand their library of web services to prevent and validate data at the source and integrate with third-party services. The organization has also created a time quality review process, though this area still requires improvement.

---

### NY Power Authority

**About:** Established in 1931 and headquartered in White Plains, New York, NY Power Authority is a public corporation and a state-owned power organization in the United States. The company is a provider of electricity for New York State citizens.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, AI, Lineage |
| **Business Initiative(s)** | New Core Systems & Migrations |

**Proof Point:**

Ataccama supports NYPA’s mission to modernize its data infrastructure as the organization advances clean energy and AI initiatives. The shift away from legacy tools like Trillium aligns with NYPA’s goal to adopt modern, AI-enabled platforms that ensure data is correct, consistent, and dependable. Ataccama is positioned as a foundational component of NYPA’s broader digital transformation and governance strategy.        

NYPA faced limitations with its legacy data quality tools (Trillium embedded with SAP & Collibra), which lacked flexibility & functionality. Integration complexity and performance gaps around profiling, deduplication, and workflow created inefficiencies in managing customer and vendor data. Additionally, concerns around hybrid security and the need for scalable rule implementation drove the decision to adopt Ataccama.        

In Phase 1, Ataccama was used to integrate and assess data quality for Dynamics CRM and SAP, with dashboards built in Power BI and tasks/workflows configured natively in Ataccama. The solution replaces Trillium and introduces rule-based profiling, deduplication logic & address validation via Loqate (pending purchase). In Phase 2, NYPA is expanding coverage to Maximo, Primavera, and additional SAP use cases, while planning to onboard more users and utilize Ataccama more to feed enterprise level reporting through Power BI.        

Though the phased implementation is still ongoing, ATA has provided NYPA with clearer workflows  and reduced reliance on disconnected tools. While full results are still emerging, users have already highlighted improved visibility, ease of rule implementation, and readiness to scale. NYPA expects long-term gains in data reliability, AI-readiness, and cross-domain governance through deeper Ataccama adoption.

---

### SSE Renewables

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** |  |

**Proof Point:**

SSE is responsible for managing and operating the high-voltage electricity transmission network in the north of Scotland. They power homes and businesses across the UK, leveraging a network of power lines and substations to carry electricity at high voltages over long distances. They are a subsidiary of SSE plc and are closely regulated by OFGEM, the UK energy regulator. In 2021, OFGEM set a digitization mandate for UK based energy businesses to modernize. Requirements include:

- Adherence to mandated data best practices & standards
- Data made available as part of their open standards and open data portal
- Definitions maintained using “DublinCore” metadata standard
- Timely and accurate reporting (lots of it!)

Ataccama underpins SSE's digitalisation program, providing Data Quality and Cataloging to help identify and manage disparate data sources while ensuring regulatory compliance. Originally, SSE had many siloed data domains that were scattered and poorly managed. Data was often incomplete, with little cataloging and definition. SSE leverages Ataccama's Catalog and business glossary extensively, not only to manage and standardize their data but to also enable mapping to the required "DublinCore" metadata framework mandated by OFGEM. Data Quality is used to ensure that information being utilized internally and reported on externally is accurate and fit for purpose.

Ataccama's engagement started with 40 Core Data Elements in Location & Asset Core Data. We have since grown to encompass 1,279 CDEs, while also expanding to cover 3,410 Business Terms in the Asset Registration Domain. The impact has been substantial. SubStation Data Quality scored 85%, It’s now 99%. Data is standardized, distributed, consistent, and tagged, both improving safety and saving money!! Plus no regulator fines!

---

### Salesforce

**About:** Salesforce.com, inc. develops enterprise cloud computing solutions with a focus on customer relationship management. The company offers Sales Cloud to store data, monitor leads and progress, forecast opportunities, gain insights through relationship intelligence, and collaborate around sales on desktop and mobile devices, as well as solutions for partner relationship management.

| Field | Value |
|---|---|
| **Products** | DQ, AI, Lineage |
| **Business Initiative(s)** | Operational Reporting |

**Proof Point:**

In 2022, Ataccama was selected as the DQ tool of choice after an internal Data Management Maturity audit identified poor DQ as a significant organizational risk. As of October 2024, Ataccama is used to ensure data quality for operational data inside of Salesforce across 5 different Lines of Business: Finance, Sales, HR, Revenue, and Tech Services. One of the domains that is subject to ATA data quality checks is the customer data domain, which is a primary focus of the Sales function. There are accuracy and completeness checks run on customer data (checks for valid phone numbers, valid email addresses, D-U-N-S number matching (identifies a company's Dun & Bradstreet business credit file, which may include firmographic data like company name, address, phone number, etc.) to ensure that customer data is as up-to-date as possible for the sales organization to be productive. Another one of the domains that is subject to ATA DQ quality checks is the employee domain, which is a primary use case for HR. When an employee is onboarded and their information is loaded into Workday, there are DQ checks in place to ensure that all required fields are complete before employees are able to use systems and send email. In the Finance LOB, they use ATA DQ Checks as part of their Supplier 360, which ensures supplier data is accurate so that they can be appropriately paid. There is an expansion of use cases planned in 2025 to the remaining different LOBs (including Customer Success, Marketing, Legal, and Data Platforms) which is being driven by the Data and Analytics team inside the CIO organization.

---

### Sazka

| Field | Value |
|---|---|
| **Products** | DQ, Lineage |
| **Business Initiative(s)** |  |

**Proof Point:**

Sazka has invested heavily in a broad digital transformation and innovation journey organization wide, with a recent focus on automation as a way to increase operational efficiency and optimize costs. Gaming is heavily regulated in Czechia, and as a gambling and lottery company Sazka needs to comply with strict regulations. This involves frequent reporting to regulatory bodies, with risk of fines if not compliant. 

Ataccama directly helps ease regulatory reporting burdens by addressing data access and quality pain points with our Data Quality and Lineage offerings. Financial reporting, both for internal and regulatory purposes, depends on gathering information from multiple sources which each contain large volumes of transactional data. In case of discrepancies, remediation was historically reactive and manual. Ataccama resolved this by connecting to these systems and proactively running daily quality checks. The clean accurate data is then fed to regulatory reporting in PowerBi. The resulting process requires less manual intervention and has reduced the risk of incurring regulatory penalties.  

As a byproduct of the data quality improvements driven by this use case, Sazka also realized additional benefits related to supplier monitoring. The same poor data and lack of visibility plaguing regulatory reporting also prevented the team from programmatically identifying and correcting issues with their suppliers. Business users needed access to reliable data to improve overall operational efficiency across departments. Ataccama is now a critical tool for uncovering mistakes caused by suppliers and a lever to demand concrete improvements.

---

### T-Mobile

**About:** Founded in 1994, T-Mobile US, Inc. provides wireless voice and data services in the United States, Puerto Rico and the U.S. Virgin Islands also serving as the host network for many mobile virtual network operators. T-Mobile is headquartered in Bellevue, WA.

| Field | Value |
|---|---|
| **Products** | DQ, AI |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

Ataccama supports T-Mobile's need for securing customer data and maintaining regulatory compliance through large-scale, continuous PII scanning. This initiative aligns with their broader goals of creating a single source of truth, integrating third-party data, and enabling faster, more accurate customer and government reporting. Our role is central to helping them protect sensitive data while modernizing their data operations. This modernization effort is addressing four key pain points.

- Aging and Unsustainable Technology: Their current MDM platform is reaching its capacity limits and is considered a toxic asset, it is built on a platform and technologies that are not supported anymore
- Scalability Concerns: The current platform's capacity limits and the need to refresh ~200,000 new source records daily necessitate a highly performant and scalable solution.
- Manual Data Management Burden: The challenges in managing data quality issues and resolving doubtful record clustering suggest a high manual effort for data stewards.
- Lack of Data Insights: Difficulty in gaining comprehensive insights into data quality and MDM processing to proactively address issues.

Following a major data breach in 2021, T-Mobile needed to address fragmented, slow, and non-compliant data processing that left customer information exposed. Their ecosystem spanned structured and unstructured data across cloud and on-prem systems, with no unified data classification or security strategy in place. These issues created compliance risks and hindered real-time business insights.	

T-Mobile leverages Data Scanning at Scale (DSS) to continuously scan and classify sensitive data across more than 22,000 databases, ensuring regulatory compliance and real-time visibility into PII assets. Automated ticketing enables rapid remediation, while centralized data quality processes reduce redundancy and streamline reporting through Power BI. With this scalable solution, they now scan 3,000 databases per month and significantly accelerate data handling timelines.	

T-Mobile has tripled the number of databases reviewed while cutting processing time in half, greatly improving their ability to comply with industry regulations. Continuous PII scanning has strengthened data security and reduced exposure risk, restoring trust post-breach. Operationally, teams now spend less time preparing data, enabling a shift from reactive to proactive customer and compliance management.

---

### The Regional Municipality Of York

**About:** York Region provides essential services to over 1.1 million residents and 48,910 businesses, offering transportation, water, emergency services, and more across 1,776 square kilometres of diverse landscape.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Operational Reporting |

**Proof Point:**

The Regional Municipality of York, often referred to as York Region, is a two-tier municipal government located immediately north of Toronto, extending to Lake Simcoe in Southern Ontario, Canada. Established in 1971, York Region is committed to fostering "strong, caring, safe communities"" by providing a wide range of essential services to its 1.2 million residents across its nine local municipalities. These regional services include public health, policing (York Regional Police), emergency medical services, regional roads, public transit (York Region Transit), water and wastewater management, waste management, social assistance, children's services, and long-term care. The Region also plays a crucial role in economic development, promoting the area as a hub for talent and opportunity.

The customer's primary data challenges stemmed from a manually-driven, decentralized data catalog that resulted in poor data discoverability and low user adoption. They grappled with fragmented and inconsistent data quality efforts lacking centralized governance, no mechanism to validate data quality, and unclear processes for users to request access or understand dataset utility. These widespread data quality issues affected thousands of tables across all 13 service areas, necessitating a comprehensive solution.	

Ataccama is being leveraged to establish a centralized, organization-wide data catalog, significantly improving data discoverability and accessibility for all employees. The tool streamlines data access and discovery, eliminates manual inquiries, and centralizes data quality governance to address fragmented efforts and validate data. This empowers employees to efficiently find and utilize reliable data, thereby enabling accurate forecasting for essential infrastructure and service needs like housing developments, garbage collection, and water/wastewater requirements. Anticipated impacts include improved confidence in decision-making via cleaner data and reduced manual effort in data discovery and validation.

---

### Woolworths

**About:** Woolworths Group is primarily a retail company with a strong presence in Australia and New Zealand.  It is best known for operating:

- Woolworths Supermarkets: The largest supermarket chain in Australia
- Countdown Supermarkets (soon to be rebranded as Woolworths): A major supermarket chain in New Zealand
- Big W: A discount department store chain
In addition to its core retail business, Woolworths Group also has interests in:
- Online data analytics and consulting services
- Financial services

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Process Automation |

**Proof Point:**

Woolworths Ataccama Use Case: Enhancing Data Trust and Quality
Objective: To increase trust in data across the Woolworths Group by establishing robust data quality management practices.
Challenges:
Lack of clarity regarding data sources and lineage.
Inconsistent data quality impacting report reliability.
Solutions:
Implementation of a data cataloging and lineage tool (Collibra) to identify data sources and track data flow.
Adoption of Ataccama for data quality checks and report certification.
Establishment of business steward-defined data quality rules for Ataccama to enforce.
Implementation of a tiered certification system (Bronze, Silver, Gold) to denote varying levels of data quality assurance.
Process:
Business stewards define data quality rules.
Ataccama performs data quality checks based on these rules.
Reports are generated and certified according to defined tiers.
Key Metrics and Success Factors:
User Adoption: Measured by the number of active Ataccama users. Significant growth observed, from 10 to over 100 users.
Platform Scalability: Measured by the number of datasets and business units utilizing Ataccama's data quality capabilities. Current deployment across 35 datasets and 8 businesses, with plans to expand to 150+ datasets and 25 businesses.
Report Certification: Measured by the achievement of certification levels (Bronze, Silver, Gold). Current status: 25 Bronze certified reports, with a focus on progressing to Gold certification.
Business Impact: Measured by the speed of achieving higher certification levels and the widespread utilization of certified reports within the business.

---
