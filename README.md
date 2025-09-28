# 🏥 On-Chain Medical Waste Tracking System

Welcome to a revolutionary blockchain solution for tracking medical waste disposal! This project uses the Stacks blockchain and Clarity smart contracts to ensure transparent, immutable, and accountable management of medical waste, preventing illegal dumping and environmental contamination. By logging every step from generation to final disposal on-chain, stakeholders like hospitals, waste handlers, regulators, and auditors can verify compliance in real-time, reducing risks to public health and the environment.

## ✨ Features
🔒 Immutable tracking of waste from origin to disposal  
📍 Geo-tagged and timestamped transfer logs  
✅ Automated compliance verification against regulations  
🚨 Alerts for anomalies or non-compliance  
💼 Role-based access for hospitals, transporters, disposers, and regulators  
📊 On-chain reporting and auditing tools  
🌍 Prevention of environmental hazards through tamper-proof records  
🔄 Integration with incentives for proper disposal (e.g., token rewards)  

## 🛠 How It Works
This system leverages 8 interconnected Clarity smart contracts to handle different aspects of the waste lifecycle. Each contract is designed for modularity, security, and efficiency on the Stacks blockchain.

### Smart Contracts Overview
1. **UserRegistry.clar**: Manages registration and roles for participants (e.g., hospitals as generators, companies as transporters/disposers, regulators as overseers). Includes functions for registering users, assigning roles, and revoking access if needed.  
2. **WasteItemRegistry.clar**: Allows creation of unique waste items with metadata like type (e.g., sharps, infectious), quantity, and initial hash. Generates a unique ID for each batch.  
3. **TransferTracker.clar**: Logs transfers between parties, including timestamps, locations (via optional geo-data), and signatures. Ensures chain-of-custody is maintained immutably.  
4. **DisposalVerifier.clar**: Confirms final disposal methods (e.g., incineration, autoclaving) with proof (e.g., hash of disposal certificate). Marks items as "disposed" only after verification.  
5. **ComplianceChecker.clar**: Automates checks against predefined rules (e.g., time limits for disposal, approved methods). Can flag violations on-chain.  
6. **AuditLog.clar**: Maintains an immutable log of all actions across the system for auditing purposes. Supports queries for historical data.  
7. **IncentiveToken.clar**: Issues fungible tokens as rewards for compliant disposals or penalties for violations. Integrates with Stacks' STX for real-world value.  
8. **NotificationHub.clar**: Handles on-chain events and notifications for stakeholders, triggering alerts for pending actions or issues.

### For Hospitals (Waste Generators)
- Register your facility via UserRegistry.  
- Create a new waste batch using WasteItemRegistry, providing details like waste type and hash of documentation.  
- Transfer the batch to a transporter via TransferTracker.  
- Monitor compliance through ComplianceChecker and receive rewards via IncentiveToken upon successful disposal.

### For Transporters and Disposers
- Register and get approved roles.  
- Accept transfers in TransferTracker, logging each movement.  
- Upon disposal, submit proof to DisposalVerifier.  
- Earn tokens for timely, compliant handling; face penalties for delays or errors.

### For Regulators and Auditors
- Use AuditLog and ComplianceChecker to query and verify the entire chain.  
- Check specific waste IDs via WasteItemRegistry and TransferTracker.  
- Generate reports on-chain for environmental impact assessments.

That's it! Deploy these contracts on Stacks, integrate with a frontend dApp for user-friendly interactions, and start tracking waste securely. This setup ensures no single point of failure and promotes global standards for medical waste management.