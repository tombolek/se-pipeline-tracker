# Finance — Other Financial Services

> Post-trade infrastructure, payments, and pan-African banking. Common themes: trade settlement, payment accuracy, regulatory compliance, enterprise-wide data platforms.

---

*3 customers*

### Absa

**About:** Absa Group Limited (Absa) is an African financial services company with a global perspective. The company operates in South Africa, Botswana, Mauritius, Seychelles, Uganda, Kenya, Ghana, Mozambique, Tanzania, and Zambia.

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Customer 360, Regulatory Compliance Reporting |

**Proof Point:**

Absa Group Limited, commonly known simply as Absa and formerly the Amalgamated Banks of South Africa (ABSA) until 2005 and Barclays Africa Group Limited until 2018, is a multinational banking and financial services conglomerate based in Johannesburg, South Africa and listed on the Johannesburg Stock Exchange.

Absa purchased an ELA encompassing every part of the Ataccama product, their programme is set up in the following order of priorities:

(1) Replace a legacy Informatica MDM solution due to regulatory reasons, poor performance, lack of ability to maintain. Absa is utilising Ataccama's orchestration, DQ profiling and then our MDM platform to power Customer 360 MDM powering a number of down stream reg reporting usecases and opening hte door for future cross and upsell opportunitites
(2) Create a centralised EDM offering where crossfunctional CDEs and crossfunctional reference data is managed as a service again ensuring high quality downstream regulatory reporting
(3) Roll out to other key projects - PII detection (reduce risk) and CIB banking (missed trades one specific usecase currently costing the bank approx 5 million RAND)

---

### DTCC

**About:** Depository Trust company (DTCC), founded in 1973 and headquartered in New York, New York, is an American post-trade financial services company providing clearing and settlement services to the financial markets.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Trade & Portfolio Data Management |

**Proof Point:**

DTCC is the central hub for processing and settling trades of stocks, bonds, and other securities in the United States. It ensures that when you buy or sell securities, the transaction is completed smoothly and safely. DTCC generates revenue through fees paid on trading volume. As a result, the business prioritizes bringing more customers onto its platform and increasing the number of transactions that those customers engage in. The US Treasury Clearing Mandate, set to go live in 2026, centralizes the trade of treasury bond among a few Covered Clearing Agencies. The Fixed Income Clearing Corp (FICC), a subsidiary of the DTCC is the main beneficiary and expects to see meaningful revenue as a result.

Higher volumes of trades mean greater stress on the underlying transactional systems. Today, the FICC relies on 30 disparate systems to distribute the burden.These are primarily on-premise, with costly compute. If they go down or there are errors in the data they produce, there are regulatory impacts to DTCC and monetary impacts to their customers. FICC's job is to create stability and trust in the market, and that requires accurate, timely delivery of data.

FICC uses Informatica Data Quality on their on-premise transactional systems. Tactically, FICC needs to transition portions of this data processing to Snowflake to alleviate the burden on legacy systems. Strategically, they want to move the majority of their compute to Snowflake to modernize their data stack. In 2024, Ataccama was introduced to DTCC team via Wipro, who was helping them select a modern Data Quality solution geared towards business users as a replacement for Informatica. Our initial implementation focuses on running 30 Data Quality rules on the Snowflake transactional data, allowing DTCC to both alleviate stress on their system and ensure an even higher level of Data Quality.

Short term, DTCC will be able to run higher volumes through their system via Snowflake. This creates more revenue at lower cost. Long term, Ataccama factors into the modernization of the DTCC technology stack, supporting the transition to Snowflake while also representing the future of Data Quality with our SaaS offering.

---

### Worldpay

**About:** Worldpay is an industry leading payments technology and solutions company with unique capabilities to power omni-commerce across the globe. Our processing solutions allow businesses of all sizes to take, make and manage payments in-person and online from anywhere in the world. Annually, we process over 40 billion transactions across 146 countries and 135 currencies. We help our customers become more efficient, more secure and more successful.

| Field | Value |
|---|---|
| **Products** | RDM |
| **Business Initiative(s)** | Regulatory Compliance |

**Proof Point:**

Worldpay is one of the world's leading payment providers. The process tens of billions of transactions a year across almost 150 countries and, as a result, have to manage nearly as many currencies. With that kind of volume accuracy in payments, settlements and financial reporting is of paramount importance. 

Ataccama's reference data model is pivotal to ensuring data between systems is consistence and no payment errors occur. Prior to Ataccama there was no single source of truth for key reference data, including (but not limited to) transaction types provided by card issuers, banking and financial details, financial category lists (to drive finance, but not chart of accounts). Data was held in siloes by application teams, often manually maintained in SQL databases or offline spreadsheet copies. This resulted in increased risk and inaccuracy with financial reports, requiring manual efforts to remediate.	

Ataccama RDM was put in place in 2018 to standardize reference data across the organization. With just a small team in place, Worldpay has been able to save costs, reduce human error, and improve the time it takes to produce key financial reports.

---
