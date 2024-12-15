# uAgents NPM Package

NOTE: Until the package is complete, installation + usage will not work. Please update the README as progress ensues.

**Team**: Steven Le, Joshua Demo, Jonathan Nguyen, Mauricio Curiel
**Repository**: [GitHub - Luceium/uAgents-NPM](https://github.com/Luceium/uAgents-NPM)
**Discussion**: [Fetch.ai uAgents Discussion #539](https://github.com/fetchai/uAgents/discussions/539)

---

## Table of Contents

1. [Overview](#overview)
2. [Why uAgents NPM?](#why-uagents-npm)
3. [Objective](#objective)
4. [Installation](#installation)
5. [Usage](#usage)
6. [TypeScript Support](#typescript-support)
7. [Testing](#testing)
8. [Contributing](#contributing)
9. [License](#license)

---

## Overview
The **uAgents NPM Package** brings the power of Fetch.ai's uAgents framework to the JavaScript and TypeScript ecosystem. Designed for web developers, hackathon participants, and builders of interactive web applications, this package enables seamless integration of agent-based technologies into modern web projects.

---

## Why uAgents NPM?
Fetch.ai is on a mission to become the leading agent hosting platform. However, the current uAgents framework only exists as a Python library. This creates friction for web developers, especially those building JavaScript-based applications at hackathons, where rapid prototyping is critical.

To address this gap, we introduce the **uAgents NPM Package**:
- Full feature parity with the original Python uAgents library.
- Built for modern JavaScript and TypeScript developers.
- Accelerates adoption of Fetch.ai's tools in web development and hackathons.

Web applications are fast to create, visually appealing, and easy to demo—qualities that matter for projects seeking quick feedback or showcasing innovation.

---

## Objective
The uAgents NPM package aims to:
- Provide full **parity** with Fetch.ai's Python uAgents library.
- Enable easy integration of Fetch.ai's agent-based framework into JavaScript/TypeScript projects.
- Include **TypeScript support** with types for all API responses to enhance the developer experience.
- Lower the barrier to entry for web developers and hackathon participants working with Fetch.ai technologies.

---

## Installation
To install the uAgents NPM package, run the following command:

```bash
npm install @fetchai/uagents
```
---

## Usage
Here's a basic example to get you started:

```typescript
import { Agent } from "@fetchai/uagents";
```

For more advanced examples and API documentation, check out the [full documentation](#).

---

## TypeScript Support
The uAgents NPM package comes with full TypeScript support, including detailed type definitions for all API responses. By leveraging TypeScript, developers can:
- Catch errors early during development.
- Benefit from autocomplete and inline documentation in their editors.

---

## Testing
We use **Jest** with **ts-jest** to ensure robust testing and maintain feature parity with the original Python uAgents library.

### Running Tests
To run tests locally:

```bash
npm run test
```

All Python tests are actively being migrated to TypeScript to ensure consistency and reliability across both ecosystems.

---

## Contributing
We welcome contributions to improve the uAgents NPM package! To contribute:

1. Fork the repository.
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/uAgents-NPM.git
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Make your changes and write tests.
5. Submit a pull request.

For detailed contribution guidelines, please check the [CONTRIBUTING.md](#).

---

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.

---

## Acknowledgments
uAgents NPM was started by the following Fetch.ai interns: **Steven Le, Joshua Demo, Jonathan Nguyen, and Mauricio Curiel**.
