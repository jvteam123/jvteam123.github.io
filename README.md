# Team123 - Project Tracker

This repository contains the front-end code for the Team123 Project Tracker, a web application designed to help teams manage and track project tasks with various fix categories, GSDs, and tech assignments. It features user authentication via Google Sign-in, a comprehensive project table with real-time updates, and administrative dashboards for project settings and summaries.

## 🚀 Features

* **Google Sign-in:** Secure authentication for authorized users.
* **Project Creation:** Add new projects with specified fix categories, number of areas, project names, and GSD (Ground Sample Distance).
* **Task Tracking:**
    * Assign tasks to specific technical IDs.
    * Track project status through multiple days (`Available`, `InProgressDay1`, `Day1Ended_AwaitingNext`, `InProgressDay2`, `Day2Ended_AwaitingNext`, `InProgressDay3`, `Completed`, `Reassigned_TechAbsent`).
    * Record start and end times for Day 1, Day 2, and Day 3.
    * Automatic calculation of task durations.
    * Option to deduct break durations and add manual additional minutes.
    * Add technical notes for each task.
    * **Reset Task:** A "Reset" button is available to clear all time entries, notes, and reset the status to "Available".
* **Project Filters:** Filter tasks by project batch, month of creation, and fix category.
* **Grouped View:** Tasks are grouped by project batch and fix category, with collapsible sections for better organization.
* **Team Lead (TL) Dashboard:**
    * View all project batches and their associated fix categories.
    * Option to 'Release to Next Stage' tasks from one fix category to the next (e.g., from Fix1 to Fix2), creating new tasks in the next stage for completed/awaiting tasks.
    * Delete all tasks within a specific fix category for a batch.
    * Delete an entire project batch.
* **TL Summary:** Generate a summary of total minutes and decimal hours spent per project name and fix category.
* **User Settings (Admin):** Manage a list of allowed user emails that can access the application (requires PIN).
* **Task Reassignment:** Reassign tasks to a new tech ID, marking the original task as 'Re-assigned'.

## 🛠️ Technologies Used

* **Frontend:** HTML, CSS, JavaScript
* **Backend & Database:** Google Firebase
    * **Firebase Authentication:** For user sign-in.
    * **Cloud Firestore:** Real-time NoSQL database for storing project data, user settings, and activity logs.

## ⚙️ Setup and Installation

### 1. Firebase Project Setup

1.  **Create a Firebase Project:** Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  **Register Your Web App:** In your Firebase project, add a web app and copy your Firebase configuration.
3.  **Update `script.js`:** Replace the placeholder `firebaseConfig` object in `script.js` with your actual Firebase configuration.

    ```javascript
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY", // Replace with your actual key
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_STORAGE_BUCKET",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID",
        measurementId: "YOUR_MEASUREMENT_ID" // Optional
    };
    ```

    **⚠️ CRITICAL SECURITY WARNING:** Your Firebase API keys are exposed directly in `script.js`. For production environments, it is crucial to implement [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/overview) for Cloud Firestore and restrict API key usage in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). This will help secure your data and prevent unauthorized access.

### 2. Enable Firebase Services

In your Firebase project console:

1.  **Authentication:** Go to "Authentication" and enable "Google" as a sign-in provider.
2.  **Firestore Database:** Go to "Firestore Database" and create a new database.
    * Set up your Firestore Security Rules to control read/write access. For example, to allow authenticated users to read and write to `projects` and `activity_logs`, and for only specific users to manage `settings/allowedEmails`:

        ```firestore
        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            // Allow authenticated users to read and write project data
            match /projects/{document=**} {
              allow read, write: if request.auth != null;
            }

            // Allow authenticated users to read and write activity logs
            match /activity_logs/{document=**} {
              allow read, write: if request.auth != null;
            }

            // Allow only specific authorized users to manage allowedEmails
            // Make sure the email 'ev.lorens.ebrado@gmail.com' (or your admin email) is in allowedEmails array
            match /settings/allowedEmails {
              allow read: if request.auth != null; // Everyone can read allowed emails to check authorization
              allow write: if request.auth != null && get(/databases/$(database)/documents/settings/allowedEmails).data.emails.hasAny([request.auth.token.email]);
              // The above rule assumes allowedEmails is an array of emails and only users with one of those emails can write to it.
              // For simplicity, you might want to initially set this rule to allow admin only after hardcoding an admin email for the first time.
            }
          }
        }
        ```
        **Note:** The provided `script.js` hardcodes `ev.lorens.ebrado@gmail.com` as a default allowed email if the Firestore document `settings/allowedEmails` doesn't exist. Ensure this is updated or handled correctly in your Firebase project.

### 3. Deploy to GitHub Pages

1.  **Create a GitHub Repository:** Create a new public repository on GitHub.
2.  **Push Code:** Push your `index.html` and `script.js` files to the `main` branch of your repository.
3.  **Enable GitHub Pages:**
    * Go to your repository settings on GitHub.
    * Navigate to the "Pages" section.
    * Under "Build and deployment," select "Deploy from a branch" and choose `main` as your branch and `/ (root)` as your folder.
    * Save your changes.
    * Your site will be deployed to `https://<YOUR_USERNAME>.github.io/<YOUR_REPOSITORY_NAME>/` or `https://<YOUR_ORG_NAME>.github.io/<YOUR_REPOSITORY_NAME>/`.

## 🤝 Contributing

Contributions are welcome! If you have suggestions for improvements or bug fixes, please open an issue or submit a pull request.

## 📄 License

[MIT License](LICENSE) (or other appropriate license)
