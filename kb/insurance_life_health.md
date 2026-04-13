# Insurance — Life, Health & Annuities

> Life insurers, health insurers, and annuity providers. Common themes: Policyholder 360, provider directory accuracy, MDM for customer golden records, mainframe modernization, consent management.

---

*11 customers*

### Allianz Australia

**About:** Founded in 1890 and headquartered in Germany, The Allianz Group is an insurance and asset management company offering a broad range of personal and corporate insurance services, ranging from property, life and health insurance to assistance services to credit insurance and global business insurance.

| Field | Value |
|---|---|
| **Products** | MDM |
| **Business Initiative(s)** | Policyholder 360 |

**Proof Point:**

Allianz Australia strategy focuses on "True Customer Centricity" and being "Digital by Default". These initiatives aim to enhance customer experience by providing accurate and consistent information, reduce operational costs by improving data management efficiency, and support regulatory compliance by ensuring data quality and security. Allianz believes that by focusing on these values they can achieve sustainable and capital-efficient growth. 

There were several data challenges that preceded the purchase of Ataccama:

- Data Silos and Inconsistency: Customer records were spread across multiple systems (e.g., POLISY, ABS) and were segregated in several repositories, leading to incomplete, duplicate, and inconsistent source records for the same customer.
- Lack of Master Data: The absence of a unique identifier between disparate source records made it difficult to link them and create a single view of the customer.
-  Aging and Unsustainable Technology: The old MDM platform was reaching its capacity limits, leading to scalability issues. Allianz's system needs to refresh ~200,000 new source records daily, which requires a highly performant and scalable solution.
- Manual Data Management Burden: Challenges in managing data quality issues and resolving doubtful record clustering.
- Lack of Data Insights: Difficulty in gaining comprehensive insights into data quality and MDM processing to proactively address issues.

Ataccama MDM was implemented to create a single, trusted view of customer data. Our matching capabilities are used to standardize and cleanse customer data. We integrate directly with existing systems to streamline data management processes.

The impact has manifested in several ways:

- Improved Customer Data Accuracy: A significant reduction in "false positives" (incorrect clusters) and "false negatives" (records missed) in customer clusters, leading to a highly accurate and reliable single view of the customer.
- Enhanced Data Quality: Greater confidence in the quality of customer data due to automated standardization, cleansing, and validation processes, reducing manual efforts and improving the overall trustworthiness of data for marketing, BI, and operational activities.
- Operational Efficiency: Faster processing of daily incremental updates (less than 3 minutes)  and streamlined data stewardship workflows, allowing staff to focus on critical issues rather than manual data reconciliation.
- Better Business Decisions: Access to an "authoritative customer data set" and insights from dashboards and reports  enables more informed decision-making for marketing campaigns, BI, and customer service.

---

### Assurant

**About:** With over 300 million customers worldwide and a $9.5B market cap, Assurant is the #1 insurer of mobile phones, electronic devices and home appliances and furnishings (#365 on Fortune 500).

| Field | Value |
|---|---|
| **Products** | MDM, RDM |
| **Business Initiative(s)** | Policyholder360 |

**Proof Point:**

Ataccama MDM is intended to improve their customer experience across all of their insurance products and services. Assurant wants to create an omni channel experience by linking data across their LoBs to include chat, phone, email all tied to master ID. The 2 initial LoBs they're focusing on are Assurant's renters insurance business and their mobile business, and specifically the T-Mobile trade-in program. 
This will drive increased revenue by cross selling services and retaining customers as well as higher CSAT and customer NPS.
Ataccama RDM has enabled Assurant to move away from duplicative manual maintenance of lists such as product groupings, client groupings, calendars, programs, and more by consolidating this into a central governed area.

---

### Blue Cross Blue Shield Association

**About:** Blue Cross Blue Shield was founded in 1929. This company provides both individual & family health insurance. Their headquarters are located in Chicago, Illinois.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

BCBSA has three use cases :
Mitigate regulatory and security risk: Validate the medical provider info that BCBSA receives from multiple blues and other insurance providers real time, before approving the work and issue pay out to the medical providers

MDM: For above accurate and 360 provider data is key. Robust MDM solution implemented that helps provide single view of provider data, is automated and real time for seamless, compliant and expedited approval

Insurance negotiation: Mastered data of medical providers used in conjunction with location id to identify provider’s geolocation. This enables plans team to negotiate better insurance rates and provide insurance to users at  affordable costs

---

### Blue Cross Blue Shield North Carolina

**About:** Blue Cross and Blue Shield of North Carolina is an independent licensee of the Blue Cross Blue Shield Association and a not-for-profit health insurance provider. Blue Cross offers a wide variety of healthcare, dental, life insurance and Medicare coverage. The company is headquartered in Durham, North Carolina.

| Field | Value |
|---|---|
| **Products** | DQ, RDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

The Healthcare Effectiveness Data and Information Set (HEDIS) is a tool used by more than 90 percent of U.S. health plans to measure performance on important dimensions of care and service. HEDIS' primary purpose lies in improving preventative care. Preventative care, including routine screenings for common medical conditions, results in better health outcomes and reduced healthcare costs. Regulators use HEDIS data as a uniform measure of efficacy when comparing across healthcare plans. 

Blue Cross Blue Shield of North Carolina consumes over 250m medical records from external vendors (e.g. laboratories) and uses that data to inform care management decisions on a patient by patient basis. Missing information directly impacts quality of care, so BCBS NC turned to Ataccama’s Data Quality solution to monitor for issues that might arise. The results power internal dashboards where significant variances, like incomplete fields of greater than 10%, can be reported back to the business for investigation and remediation. 

These dashboards, and the data underlying them, are critical to ensure regulatory compliance related to HEDIS. Failure to report HEDIS data accurately and on timely basis can result in fines, loss of accreditations, and removal from Medicare programs. As one example, HEDIS measures directly impact an insurer’s eligibility to collect bonus payments as part of the Medicare Advantage five-star rating system. Payouts under this program totaled over $11b in 2024 and inclusion can mean the difference across tens of millions of dollars of revenue for individual insurers. As a result, leadership at BCBS NC consider HEDIS data critical and monitors it closely.

---

### Community Health Plan of Washington

**About:** CHPW Community Health Plan of Washington is a not-for-profit health insurance company that has been providing quality health care to Washington families for 30 years. They offer Medicaid, Medicare Advantage, and Individual & Family health plans.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Policyholder 360 |

**Proof Point:**

CHPW is leveraging DQ, Catalog and Lineage capabilities of Ataccama to better understand the health plan data for their customers and provide accurate reporting on that information. All their data is in Snowflake today and by using accurate information, they would like to create better health plans (data products) for their customers.

---

### EnactMI

**About:** Enact, through its subsidiaries, is a leading U.S. private mortgage insurance provider, offering borrower-centric products that enable lenders and other partners across the U.S. to help people responsibly achieve and maintain the dream of homeownership. In addition to our recognized excellence in underwriting and track record of prudent risk and capital management, our reputation for going the extra mile for our customers has made us a partner of choice for over 1,800 lenders. We leverage our de

| Field | Value |
|---|---|
| **Products** | DQ, Lineage |
| **Business Initiative(s)** | Claims Handling, Forecasting & Recoveries |

**Proof Point:**

EnactMI provides mortgage insurance in the U.S. This is a critical product for home buyers, allowing individuals to qualify for government backed mortgages without contributing a full 20% down payment. As a result, homes become more affordable to those who may be able to support the monthly payments necessary to purchase a home but have not had enough time to accumulate the necessary savings to qualify. EnactMi's slogan is "Let's Make Homes Happen"

Data drives significant operational value for EnactMI. Inaccurate information slows cash processing, creates issues in the billing process, and increases the manual effort involved in processing claims. As a result, the Enact team is focused on:

- Helping their data science team automate existing processes
- Identifying anomolies and data quality issues real time
- Creating an overall central location where all data stewards can view their data
- Sharing data company-wide without having to provide access to databases, especially for non-technical users."

EnactMI's Data Management & Governance team, led by Rajkannan Kanagarajan and Eric Moorefield purchased Ataccama's Data Quality solution to help improve both internal processes as well as external integrations. Uses include improve their cash processing and billing motion, modernizing their integrations with third party consumers and producers of data including customers and loan automation software at partner banks, and streamlining their claims system. While still early in their relationship with Ataccama, they have made tremendous progress already including mapping 8,568 terms Catalog items and importing 100% of their Snowflake footprint into our product, overlaying lineage across 200+ of those items, applying hundreds of Data Quality rules across their CDEs, and applying anomaly detection to their entire high priority governed schema (encompassing 20k+ attributes)

As a result of all of this hard work, they have dramatically reduced their time to answer critical business questions related to key data. To prove the impact, they opened Lineage in their onsite and answered a question in 10 minutes that previously took IT over four days to investigate unsuccessfully.

---

### Humana

**About:** Humana is the fourth largest health insurance provider in the United States ($105B in revenue, #42 on Fortune 500) with a particular strength in Medicare-related products and services. Humana offers a wide range of health insurance products and services, including Medicare Advantage plans, Medicare Prescription Drug Plans, Commercial group health plans, Individual health insurance, Dental and vision plans and Specialty benefits.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting, Policyholder 360 |

**Proof Point:**

Humana leverages Ataccama MDM to solve their consistent “red” score for the insurance and healthcare provider directory as it was not able to meet strict government-set accuracy benchmark of 96% (regulatory compliance)
Ataccama MDM is used to validate, verify & continuously update Humana's provider directory of over 3M records providing intelligent matching and merging of data to ensure automated, batch and eventually real time updates, amd to ensure easy data transformations & transparent data cleaning rules. 
Incoming data is processed from various modern and legacy sources (SFDC, Postgres claims management system, Oracle DBs, legacy SQL homegrown apps). Analytics run on Azure Synapse and PBI.
Outcome - Accurate provider information to their customers resulting in higher CSAT and avoidance of regulatory fines (not quantified yet)

---

### Industrial Alliance Financial Group

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM |
| **Business Initiative(s)** | Policyholder360, Regulatory Compliance Reporting, Data Privacy, Consent & Preferences |

**Proof Point:**

Ataccama MDM has enabled IA to migrate from their legacy system on the mainframe (consumed 40% of the Mainframe capacity at a cost of ~$6M a year) as well as to connect it to a number of other back office data systems. 
Ataccama MDM delivers high quality "golden customer records" which support 3 key busines iniatives:  1). unified consent management;  2). Client experience via One Portal and 3). Organic Growth.   The Global Client Experience (GCX) team leverage MDM to deliver on their initiative to increase the average number of products per customer from 1.2 to 4 products by 2030 across their 5 product lines (note: the GCX leader vowed to cover the cost of his team with increased cross sell). So far the # of products has grown to 2.5.   Ataccama MDM is also used to enable IA to to meet the new Personal Information Protection and Electronic Documents Act (PIPEDA) (consent and preference management regulation with a 5% of annual revenue potential fine) regulation. Selected metrics processed in MDM - 1400 attributes, ~375M total records, over 25K data change events published to Kafka topics every day. Moving to a single customer record also significantly reduces license cost of Okta meaning they don't need to have 3-4 licenses for the same user in Okta.

---

### MetLife

**About:** With 90 million cusotmers across 60 countries and revenue of $70B (#43 on Fortune 500), MetLife is a leading global provider of insurance, annuities and employee benefits programs. They hold leading market positions in the US, Japan, Latin America, Europe, the Middle East and Africa.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Operational Reporting |

**Proof Point:**

MetLife has various data sources across their modern Azure infrastructure, on-premises DBs and legacy systems. They needed to find a Data Quality tool that could handle their various use cases.
After deploying Ataccama in a limited POC we were able to achieve the following results and MetLife became a customer and has been scaling the below initiatives.
- Scale up to 600 data sources
- Handle 10s of thousands of catalogs
- Bi-directionally sync with Collibra
- Able to handle deployments across the globe with critical data elements being housed in various locations across various source systems
- Send alerts and create incident tickets in ServiceNow on data quality issues
- Automation of workflows to identify new CDEs and trigger a rule creation activity
- Export results to PowerBI for analysis, reporting and incident management
With the roll out of our newer versions, MetLife is also migrating to our cloud environment where they will be able to take advantage of our Generative AI functionality, Data Lineage and handle a true global scale out. Japan Data Quality projects will be deployed in the coming year.

---

### Prudential

**About:** Prudential Financial, Inc., through its subsidiaries, provides insurance, investment management, and other financial products and services in the United States and internationally. The company primarily offers life insurance, annuities, retirement-related, mutual funds, and investment management products and services. It operates through U.S. Retirement Solutions and Investment Management, U.S. Individual Life and Group Insurance, and International Insurance divisions.

| Field | Value |
|---|---|
| **Products** | MDM, RDM |
| **Business Initiative(s)** | Policyholder360, AI Readiness |

**Proof Point:**

Prudential use Ataccama MDM to drive their Customer 360 program with the goal of having one place for all customer data and to enable a move away from a legacy mastering process tied to the mainframe. Legacy solution costs ~$1M annually just to keep the lights on and lacked capability i.e. no understanding of the data, whether for BI/Analytics or even which match/merge rules are being used most frequently to help understand underlying DQ/profile issues.
Ataccama MDM enables low latency processing, real-time pub-sub (capability to create publishing handlers which users can subscribe to), services, and model adaptability, to use MDM to understand data quality and track DQ trends, rectify the data both automatically and manually, provide Data Stewards with the ability to resolve potential matching issues (proposals) via user-friendly interface give master data browse, search and analyse access to business users. Prior to Ataccama they weren't able to understand if they had the same customer with multiple products, customers with multiple different addresses and contact details across different systems. As a result of ATA, Prudential has seen improved customer service experience, reduction in time to handle multi-product customer calls, increase in quality and precision of Data Science models and improved regulatory reporting [what regulatorey reporting?] timeliness and fewer delays & penalties. [what system does the customer data sit in e.g. where does customer service go to look for customer info?]

---

### Resolution Life

**About:** Resolution Life is a global life insurance group focusing on the acquisition and management of portfolios of inforce life insurance policies.

| Field | Value |
|---|---|
| **Products** | MDM |
| **Business Initiative(s)** | New Core Systems & Migrations |

**Proof Point:**

Ataccama has worked with the Australian arm of Resolution Life, a global Insurance company since 2021. Their 1,000 employess across ANZ service ~900k customers, providing superannuation, investments, and life insurance policies. In total, they manage ~$30 billion in assets in this region. To fuel their growth, Resolution Life engages in a deliberate M&A strategy. 

Ataccama's primary MDM use case is helping consolidate Resolution Life's policy and customer data across newly acquired businesses. Our MDM solution is used to identify duplicate customers in disparate systems. There is significant cost savings when they can decomission any systems or infrastructure pertaining to the historical architectural set up of the acquired company.

---
