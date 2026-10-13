# SmartFace AI: Edge Biometric Face Attendance System

A modern, production-grade Machine Learning web application for real-time facial recognition and attendance management. Built with **Next.js**, **Tailwind CSS**, and **TensorFlow / Face-API**, running **100% client-side Edge AI** in the browser and ready for **1-click Vercel deployment**.

---

## 🌟 Key Features

1. **Dual Enrollment Modes:**
   - **Live Webcam Capture:** Snap photos directly using laptop or mobile phone cameras (supports front and back camera switching).
   - **Gallery / File Upload:** Upload pictures from your photo library or computer files (`.jpg`, `.png`, `.webp`).
   - **Multi-Sample Angles:** Capture 1 to 3 face photos (Front, Left, Right) to achieve >98% recognition accuracy.

2. **Real-Time Live Scanner:**
   - 30–60 FPS in-browser facial detection and identification.
   - Dynamic HUD bounding box: Displays **Student Name** and **Match Confidence %** in real-time.
   - Intelligent anti-duplicate cooldown: Prevents spamming multiple records for the same student within a session.
   - Audio chime and speech synthesis announcement when attendance is marked.

3. **Student Directory & Portable Backups:**
   - Searchable directory of all registered students with profile pictures and roll numbers.
   - **Backup to JSON:** Download the biometric database as a portable JSON file.
   - **Restore from JSON:** Transfer registered profiles between laptops and mobile phones in 1 click.

4. **Attendance Audit Sheet & CSV Export:**
   - Real-time statistics: Total Registered, Present Today, Absent, and Turnout Rate %.
   - **Export to CSV:** 1-click download of an official `.csv` attendance report for Excel or Google Sheets.

---

## 🧠 Machine Learning Architecture (For Viva Defense)

| Stage | Algorithm / Model | Output |
| :--- | :--- | :--- |
| **1. Face Detection** | Single Shot MultiBox Detector (SSD MobileNet v1) | Bounding Box `[x, y, w, h]` |
| **2. Landmark Alignment** | 68-Point Facial Keypoint Predictor | Straightened & normalized face |
| **3. Feature Extraction** | Deep ResNet-34 Feature Embedder | **128-Dimensional Vector** $\vec{v} \in \mathbb{R}^{128}$ |
| **4. Classification / Matching** | Euclidean Distance ($L_2$ norm) with threshold $\tau \le 0.55$ | Verified Student + Confidence Score |

### Mathematical Formula:
$$d(\vec{u}, \vec{v}) = \sqrt{\sum_{i=1}^{128} (u_i - v_i)^2}$$

* If $d(\vec{u}, \vec{v}) \le 0.55$: Match confirmed.
* Confidence Score:
  $$\text{Confidence (\%)} = \max\left(50, \min\left(99, \text{round}\left(\left(1 - \frac{d}{0.55 \times 1.3}\right) \times 100\right)\right)\right)$$

---

## 🚀 How to Run Locally

```bash
# 1. Navigate to project directory
cd smart-face-attendance

# 2. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 How to Deploy to Vercel (Live Website on Any Mobile/Device)

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Initial commit of SmartFace AI project"
# Create a repository on GitHub (e.g. smart-face-attendance)
git remote add origin https://github.com/<your-username>/smart-face-attendance.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **"Add New..."** $\rightarrow$ **"Project"**.
3. Select your `smart-face-attendance` repository and click **"Import"**.
4. Leave all default settings as they are (Framework: Next.js) and click **"Deploy"**.
5. Within 1 minute, you will receive your live URL:
   👉 `https://smart-face-attendance.vercel.app`

Open that link on **any phone, tablet, or laptop**, allow camera access, and test it live!
