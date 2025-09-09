#!/bin/bash

# install-matterbridge-dev.sh

# This script globally installs Matterbridge from the main branch.
# To be used only inside the Dev Container with the mounted matterbridge volume.

echo "Installing Matterbridge from the main branch..."
set -e
cd /
if [ ! -d "/workspaces" ]; then
  echo "Directory /workspaces does not exist. Exiting."
  exit 1
fi
sudo chown -R node:node matterbridge
sudo chmod g+s matterbridge
rm -rf matterbridge/* matterbridge/.[!.]* matterbridge/..?*
# Shallow clone for speed (history not needed inside dev container). Remove --depth if full history required.
git clone --depth 1 --single-branch --no-tags https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge
npm ci --no-fund --no-audit
npm run build
npm install . --global --no-fund --no-audit
rm -rf .git .github .vscode docker systemd docs public screenshot
echo "Matterbridge has been installed from the main branch."