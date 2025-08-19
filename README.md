# enviro-watch

# 🌍 EnviroWatch

EnviroWatch is a community-driven environmental reporting platform.  
It lets people **report incidents** (like pollution, illegal dumping, or hazards) on an interactive map powered by **Azure Maps**.  

The project combines:
- **React + Vite** frontend
- **Azure Functions** backend (serverless)
- **Cosmos DB** for storing reports
- **Azure Maps API** for geolocation and mapping

---

## ✨ Features
- 📍 Interactive map with clickable locations
- 📝 Submit environmental incident reports
- 🌐 Reports stored securely in **Cosmos DB**
- 🔍 View incidents in your area in real-time
- 🏢 (Planned) Nearby **recycling centers & waste facilities**
- 🔔 (Planned) Community alerts and notifications

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- [Python](https://www.python.org/) (if using Azure Functions locally)
- Azure Subscription (for deployment)

---

### 🔧 Local Setup

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/enviro-watch.git
cd enviro-watch

# Install frontend dependencies
cd web
npm install

# Start frontend
npm run dev

# In another terminal: run backend (Azure Function)
cd api
func start

