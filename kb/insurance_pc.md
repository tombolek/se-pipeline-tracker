# Insurance — Property, Casualty & Specialty

> P&C insurers, specialty insurers, and reinsurers. Common themes: underwriting data quality, claims data, regulatory compliance (Solvency II, APRA), reference data management for financial reporting.

---

*8 customers*

### AXA

**About:** AXA generates over $100B in revenue operating across multiple insurance segments, including P&C commercial and personal lines, life and health insurance, and employee benefits

| Field | Value |
|---|---|
| **Products** | DQ, RDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

Solvency II is a European Union (EU) Directive that establishes a set of supervisory requirements for almost all insurance and reinsurance companies within the EU. It aims to ensure adequate protection for policyholders and beneficiaries by setting rules on capital adequacy, risk management, and governance for these companies. Primarily the purpose is to ensure that an insurer has enough capital available to cover claims they may be called on to fulfill. 

Ataccama is used for the calculation of metrics required for Solvency II reporting, displacing the prior solution, Trillium, for this purpose. Previously regulatory reporting was complicated, highly customized, and, as a result expensive to maintain. Ataccama was brought in due to our business friendly, customizable, and reusable interface. Our Data Quality offering is considered a best in class product and aligned with the new data management stack being prepared for an eventual enterprise rollout. Data standards are ingested from Collibra, and expanded with Data Quality logic in Ataccama. Ataccama is then used to pull data from Solvency II data sources, calculate the necessary metrics, and fed into a repository used to govern submissions to regulators. This process used to be possible only quarterly, but using Ataccama AXA is now capable of running on a much more frequent basis. This increased velocity reduces risk by allowing for issues to be rectified intra-quarter.

Penalties for failure to comply with Solvency II can range anywhere from millions of dollars in fines to loss of authorization to operate as an insurer. There is also significant reputational harm that can be done from incurring action.

---

### Aviva

**About:** With over $45B in revenue, Aviva operates across multiple insurance segments, including general insurance, protection, health, wealth management, and retirement services. The company has a significant presence in key markets such as the UK, Ireland, and Canada

| Field | Value |
|---|---|
| **Products** | RDM |
| **Business Initiative(s)** | Operational Reporting, Regulatory Compliance Reporting |

**Proof Point:**

Aviva have been users of Ataccama for reference data purposes for a number of years, and have an extensive enterprise wide implementation of centralised static data for all purposes, including customer, financial reporting, policies and claims reference data.  The main usage is within Finance, where Ataccama is used to maintain global charts of accounts for the general ledger and various local and international standards such as IFRS17 (International Financial Reporting Standards) and US GAAP. 

Aviva will soon be integrating Ataccama to Snowflake to be the gloden source of corporate reference data within the data lake for reporting.

---

### Convex

**About:** Convex are a large specialist insurerer and reinsurer based in the UK.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM |
| **Business Initiative(s)** | Risk Management, Claims Handling, Forecasting & Recoveries |

**Proof Point:**

Convex are a large specialist insurerer and reinsurer based in the UK. Since 2021 Convex have been leveraging Ataccama DQ to manage and support risk and decision making on policy and claims data. Their main focus has been to embed DQ into all of their data flows to ensure the quality of all relevant data for better decision making and to decentralise DQ and issue management ownership from the central data team and into the policy and claims management teams. By implementing Ataccama the team have delivered a reduction in reputational, regulatory and financial risk through active monitoring of data quality across the organisation, monitoring of ‘top 10’ most crtical data elements published via exec an dashboard. These dashboards were designed by an external agency and tagged 'Powered By Ataccama'. Screenshots available here:

https://ataccama.slack.com/files/U4TCK0HPV/F06NJ2VJ5UM/screenshot_2024-03-08_at_14.59.41.png
https://ataccama.slack.com/files/U4TCK0HPV/F06N6DG1R4P/screenshot_2024-03-08_at_14.59.36.png

---

### Domestic and General

**About:** Domestic & General, headquartered in Warwickshire, provides warranty services and comprehensive product protection.

| Field | Value |
|---|---|
| **Products** | DQ, RDM |
| **Business Initiative(s)** | Underwriting & Rate Setting |

**Proof Point:**

Domestic & General specialises in appliance protection plans, offering extended warranties and service contracts rather than traditional insurance. They underwrite and administer coverage for mechanical and electrical breakdowns, managing risk, claims, and repairs. Their products mitigate financial exposure to appliance failure, ensuring continuity through authorised repair networks and structured premium-based agreements.

There are two main areas where Ataccama provides value to Domestic & General using our Reference Data Management Product. 

First, Ataccama Reference Data is used as a golden source of static data for D&G's telephony systems (for repairs and extended warranties), resulting in cost efficiencies, and reduced reputational and financial risk previously caused by inconsistent Excel spreadsheets.

Second, a new product called Warranty in a Box was released, initially in the US, to commoditise the creation of extended warranties and handle the underlying financial calculations. This project calls for controlled and managed reference data, data that Ataccama's RDM is being used to house and distribute. The improved control afforded by our offering has resulted in reduced manual errors, thereby saving costs and improving customer service.

---

### Hamilton

**About:** Hamilton is a $2.25B revenue, 100-year-old insurance agency that provides comprehensive personal and business insurance solutions, covering everything from auto and home insurance to specialized commercial insurance for industries like manufacturing, trucking, and medical malpractice.

| Field | Value |
|---|---|
| **Products** | DQ, MDM, RDM |
| **Business Initiative(s)** | Underwriting & Rate Setting, Regulatory Compliance Reporting, Fraudulent Claim Detection, Claims Handling, Forecasting & Recoveries |

**Proof Point:**

Hamilton use RDM across LOB's to set valid configuration options and ensures that the correct line of business can offer the correct products - this supports year end financial reporting and manual fixing and also avoids business decision error upfront before it can cause a downstream DQ issue. 

For Policy teams DQ is used to ensure that Policies make sense and DQ rules are applied to make sure a policy is valid. The impact of doing this incorrectly results in increased financial and regulatory risk (Solvency II, Sarbanes Oxley, FCA, PRA, and Lloyds of London)and would increase overall exposure. This check ensures that the polcies are not going to have a negative impact on the business. Furthermore, Ataccama's DQIT is used to manage the tracking of manual controls for Sarbanes Oxley compliance.

For Claims teams anomaly detection is used to determine whether claims fall outside of the normal distribution for the particular claim type - ie a £1 million claim on auto insurance. These are flagged for checking before payment.
In Finance, RDM is used as a centralised locked down source of truth for Exchange Rate data - this propagates through P&L, Finance and Reg reporting ensuring Data Accuracy and cost and risk reduction through centralising and mastering market data once.

At the Group level Ataccama is used to consolidate data for reporting and to streamline reporting for acquired companies.

---

### Markel

**About:** Markel are a global specialist insurer with over $50bn in insured assets around the world.

| Field | Value |
|---|---|
| **Products** | DQ, RDM |
| **Business Initiative(s)** | Regulatory Compliance Reporting |

**Proof Point:**

Markel have been using RDM since 2019 for the centralisation and management of static financial data, for both both regulatory and statutory financial reporting (IFRS17 International Financial Reporting Standards, US GAAP, etc). This implementation is pivotal to optimizing their business processes, reducing reconciliation breaks, and reduces time and human error. The implementation is part of a global program to implement Phinsys financial accounting software for Markel International, to automate and improve financial processes. 
Since mid-2024 Markel been expanding their offering to include a rollout of RDM globally, both across different divisions as well as geographies to further standardize reference data and improve overall data quality.
We have also begun working on a global catalog for both data governance and data quality to replace the incumbent Collibra solution, which had failed to gain traction after some years of use. The purpose of this exercise is to determine the full list of Critical Data Elements for the entire organisation, determine where these data exist across all systems, and then to measure the quality of each CDE.

---

### QBE

**About:** With over $42bn of assets under management QBE and $22B in annual revenue, QBE is one of the top 20 global insurers.

| Field | Value |
|---|---|
| **Products** | DQ |
| **Business Initiative(s)** | Underwriting & Rate Setting, Risk Management, Claims Handling, Forecasting & Recoveries, Data Privacy, Consent & Preferences, Regulatory Compliance Reporting |

**Proof Point:**

Since 2021 QBE has leveraged Ataccama DQG to validate critical data for claims, customer and policy information for accurate risk assessment and premium pricing, across all regions globally (Asia/Australia/Europe/North America). Furthermore, in Australia, Ataccama helps QBE meet the APRA (Australian Privacy Rights Act) and the Prudential Standard CPS 220 Risk Management regulation (ensures Insurance entities have robust security controls in place to protect against information security incidents and operational risks) regulatory requirement.  In addition, Ataccama DQG also enhances underwriting precision, streamlines fraud detection (Asia), and ensures high-quality customer data across multuple lines of business (for group-level reporting functions), reducing duplication and outdated information to improve efficiency and minimize costly errors across policy, claims and customer teams. Policy teams leverage centralised high-quality data to manage exceptions and validate that policies make sense, Claims teams validate whether the claims fit within a standard set of rules, Customer teams check whether the customer has passed regulatory checks (AML etc) and Fraud teams to validate legitimacy of fraud claims.

---

### RSA Insurance Group

**About:** RSA provides personal and commercial general insurance products. It offers property, automobile, liability, and specialty insurance products. The company was established in 1710 and is headquartered in London, United Kingdom.

| Field | Value |
|---|---|
| **Products** | RDM |
| **Business Initiative(s)** | Regulatory Compliance |

**Proof Point:**

RSA was acquired by Intact Financial in November 2020, a Canadian Insurer. As part of the merger, numerous technical integrations were required. Prior to Ataccama there were numerous disparate systems, manual processes and data duplicity across environments.

RSA's finance team are long term users of the Ataccama platform, first purchasing our solution in 2017. They are the only UK customer to leverage our product in the "Solution as a Service" format, wherein Ataccama has responsibility for all configuration of the platform / project work, as well as the PaaS environment. RSA's users are business-end users who maintain reference data in the UI only. Ataccama is used extensively across the finance teams to support all aspects of finance operational activities, from regulatory reporting (Solvency II, IFRS17 and others), to general ledger, finance close, reconciliations, etc.

Our product involvement is currently limited to Reference Data Management. Ataccama was acquired to standardize slow-moving data across the estate in order to work from a single version of the truth within financial reference data. RDM is used to maintain and control this data, which is subsequently fed downstream to finance systems / general ledger / data warehouse. The use of Ataccama has resulted in cost reductions, more accurate data, elimination of legacy systems and reduced risk / human error.

---
