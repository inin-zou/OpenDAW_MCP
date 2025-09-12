# Cloud Backup

openDAW supports privately synchronizing your projects in **Google Drive** and **Dropbox**.  
Both services require a one-time **OAuth login**. OAuth is the official login method provided by many cloud services.

## Flow

- You log in directly on the provider’s website
- openDAW receives a secure access token from them
- openDAW never sees your password or personal data
- No personal data or assets are stored on openDAW servers
- Everything stays in your own cloud account

---

## How it works

openDAW backs up your projects and samples to your connected cloud service. The first backup copies all projects and
samples stored locally into a hidden app folder in your cloud. Each backup after that adds new projects and samples,
updates changed ones, and deletes those removed locally so your local assets and your cloud backup stay aligned.

**openDAW does not auto-update. You need to run a backup whenever you think it is necessary.**

---

## How to remove your data and disconnect

### Google Drive

1. Go to [Google Drive settings](https://drive.google.com/drive/settings)
2. Click **Manage apps**
3. Find **openDAW** in the list
4. Choose one of the following:
    - **Disconnect from Drive** → removes openDAW’s access to your Drive
    - **Delete hidden app data** (if shown) → permanently deletes all files openDAW stored in your hidden appData space

### Dropbox

1. Go to [Dropbox connected apps](https://www.dropbox.com/account/connected_apps?utm_source=opendaw.studio)
2. Find **openDAW** in the list
3. Click **Disconnect**
4. When prompted, choose to also **delete all app folder data** if you want to remove files created by openDAW

---

Your projects are always under your control, and you can disconnect or delete them at any time.
