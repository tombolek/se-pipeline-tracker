# Finance — Asset & Investment Management

> Asset managers, investment firms, and fund managers. Common themes: third-party vendor data quality, portfolio/trade data management, regulatory compliance, quantitative model integrity.

---

*4 customers*

### Acadian

**About:** Acadian Asset Management is a global, systematic investment manager. Founded in 1986, Acadian is head-quartered in Boston, with affiliates in London, Singapore, and Sydney. We find our edge in the convergence of talented people, rich data, and powerful tools – all underpinned by a collegial culture with an ardent appetite for continuous research and healthy debate.

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Trade & Portfolio Data Management |

**Proof Point:**

Since 2020 Acadian Asset Management have been leveraging Ataccama DQ on key financial data received daily from over 40 third-party vendors and used to power their quantitative models, essential for making decisions about their clients' portfolios. Ataccama helps mitigate significant risks associated with poor data quality from external vendors which if not addressed can lead to inaccurate investment decisions, mispricing of assets, compliance failures, compromised risk management and damaged client relationships. Ataccama integrates directly with Acadian's data pipeline, performing automated tier 1 data quality checks - identifying anomalies, missing values, inaccurate data and enrichingincomplete data before it enters Acadian’s systems. 
Any data quality issues are immediately captured and notified to appropriate data stewards. DQ monitoring results are exported to Tableau and provide accurate reports per source vendor, allowing  the quality of market data being received from each vendor to be clearly measured. 
Acadian can now ensure all data entering their quantitative models is reliable, complete, and trustworthy which signifincatly improves the level of transparency and control around their investment decision-making process. [Can we see one of these dashboards. Marek has been speaking to them lately a lot; did Jack K connect with Marek on this and their future desired use cases which Marek doesn't think we can do]

---

### Coller Capital

**About:** Coller Capital is a leading global investor in the secondary market for private assets. The firm provides liquidity solutions to private markets investors worldwide, acquiring interests in private equity, private credit, and other private markets assets

| Field | Value |
|---|---|
| **Products** | MDM, RDM |
| **Business Initiative(s)** | Trade & Portfolio Data Management |

**Proof Point:**

Coller Capital is a global investment firm specializing in the private equity secondaries market. They acquire existing stakes in private equity funds from institutional investors—such as pension funds, endowments, and insurance companies—who seek to adjust their portfolio exposure or rebalance assets. Coller structures and executes complex transactions, enabling capital reallocation, risk management, and greater flexibility in portfolio strategy. By providing liquidity in a traditionally illiquid asset class, they help market participants manage timelines, optimize returns, and meet evolving investment objectives.        

Data challenges at Coller span multiple source systems, including internal platforms, vendor feeds, and market data providers. Key issues include inconsistent data formats, fragmented data, and synchronization gaps, making it difficult to maintain a single, accurate source of truth. Complex data management across various stakeholders hinders data governance and impacts reporting accuracy. Ensuring data integrity, real-time availability, and seamless integration is essential to support investment decisions, risk management, and regulatory compliance in a dynamic environment.        

Ataccama MDM is deployed to consolidate critical data related to assets under management, fund constituents, positions, and customer data. Ataccama is integrated within the ETL process between source systems and the data warehouse, to match data from in-house platforms and external vendor systems. This ensures consistent / accurate data flows into the reporting data warehouse. for accurate reporting and analytics. This enhances data quality, reduces redundancies, and supports more effective decision-making throughout the investment lifecycle.        

This ensures :
- AUM calculations are correct (reducing market risk)
- Tax calculations and regulatory reports are accurate (reducing both risk of regulatory fine)
- Costs of manual effort are kept to a minimum
- Reduced reputational risk.

---

### Dodge & Cox

**About:** Established in 1930, San Francisco-based Dodge & Cox provides professional investment management services to individuals, retirement funds, and tax exempt institutions through mutual funds and separate accounts.

| Field | Value |
|---|---|
| **Products** | MDM, DQ, RDM |
| **Business Initiative(s)** | Regulatory Compliance, Trade & Portfolio Data Management |

**Proof Point:**

Dodge & Cox (D&C) is a mutual fund managing $363b on behalf of its clients. Asset managers like D&C rely on data every day to drive allocation decisions across their portfolio. Setting up a model for a single security on D&C’s platform requires hundreds of inputs. For example, when deciding whether or not to purchase a Residential Mortgage Backed Security (RMBS) an analyst needs to understand the performance of the overall security, the characteristics of the underlying assets, and the price of the bond relative to comparable products. This analysis requires a tremendous amount of information from 3rd parties like Bloomberg, ICE, and S&P, formatted such that D&C’s internal models can effectively consume the data and output a recommendation. In a given year, D&C will trade over $10b in fixed income assets just like this. 

D&C wanted to make sure that their analysts were spending their time making sound investment decisions, not investigating data issues. To achieve this, D&C purchased Ataccama’s Data Quality solution in 2022. We integrate directly into the data pipelines in DBT, where over 300 catalog items are monitored and validated against a 250 term Collibra glossary before entering downstream systems. Anything flagged as invalid is pushed to our issue tracker for Data Stewards to review and resolve. Visualizations in Tableau allow D&C to track trends and improve overall data quality over time. The transparency provided by this process engendered greater trust in the underlying data organization wide, freeing the D&C team to focus less on remediation and more on growing their business.

---

### Fidelity Investments Canada

**About:** Fidelity Investments Canada was established in Canada in 1987. Fidelity provides a full range of domestic, international and income-oriented mutual funds, as well as asset allocation, managed solutions, ETFs and a high net worth program to Canadian investors.

| Field | Value |
|---|---|
| **Products** | DQ, Lineage |
| **Business Initiative(s)** | Regulatory Compliance |

**Proof Point:**

Fidelity Canada, established in 1987, is an industry-leading provider of investment solutions for Canadian investors, including mutual funds, and ETFs. Historically, Fidelity Canada has faced significant challenges establishing a robust, governed data environment, a significant risk in a highly regulated industry.

Fidelity faced several data challenges prior to working with Ataccama. First, they lacked the ability to measure and assess data quality against standardized metrics. Second, data discoverability was hindered by siloed information and a fragmented understanding of data residency, making data ownership a "guessing game". Third, there was a notable lack of detailed documentation, with knowledge often residing with individuals rather than being formally recorded, especially at the granular table and field level. This issue was compounded by a project-based involvement model, where critical information kept being lost whenever an individual left. Fourth, the absence of standardized nomenclature and syntax across data assets made readability and discoverability challenging, as similar names represented vastly different data. Finally, they lacked access to Critical Data Elements (CDEs) within Informatica, further impeding their ability to manage and prioritize essential data.	

In 2023, Fidelity partnered with Ataccama to mature their data governance program. They used our software to build a data-literate culture by demonstrating the value of data sharing and highlighting data inaccuracies that impeded decision-making. A key application is tracking data lineage and scanning data quality to meet regulatory requirements in their heavily audited industry. Furthermore, they are using Ataccama to establish data ownership through a stewardship model, prioritize critical data elements (CDEs), and monitor continuous improvements in data quality by reporting on metrics like validity and accuracy. This comprehensive approach allows them to understand the "true strength" of their data and enforce logic to enhance its overall quality.

---
