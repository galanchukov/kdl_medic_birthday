#!/bin/bash
# setup_vps.sh

# 1. Update and install Docker
sudo apt-get update
sudo apt-get install -y ca-certificates cursor curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2. Run Docker Compose
# Make sure .env exists with BOT_TOKEN
sudo docker compose up -d --build

echo "🚀 VPS Setup complete! Services are starting..."
