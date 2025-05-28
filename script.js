// CRITICAL SECURITY WARNING: Your Firebase API keys are exposed here.
// For production, secure your data with Firebase Security Rules and restrict API key usage in Google Cloud Console.
const firebaseConfig = {
    apiKey: "AIzaSyADB1W9YKaU6DFqGyjivsADJOhuIRY0eZ0", // Replace with your actual key if different
    authDomain: "project-tracker-fddb1.firebaseapp.com",
    projectId: "project-tracker-fddb1",
    storageBucket: "project-tracker-fddb1.firebasestorage.app",
    messagingSenderId: "698282455986",
    appId: "1:698282455986:web:f31fa7830148dc47076aab",
    measurementId: "G-6D2Z9ZWEN1"
};

let app;
let db;
let auth;

let signInBtn, signOutBtn, userInfoDisplayDiv, userNameP, userEmailP, userPhotoImg;
let appContentDiv, loadingAuthMessageDiv;
let loadingOverlay; // Reference to the loading overlay

const TL_DASHBOARD_PIN = "1234";
const ALLOWED_EMAILS_DOC_REF_PATH = "settings/allowedEmails";
let allowedEmailsFromFirestore = [];

// NEW: List of Tech IDs
const TECH_IDS = [
    "4232JD", "7248AA", "4426KV", "4472JS", "7236LE",
    "4475JT", "7039NO", "7231NR", "7240HH", "7247JA",
    "7249SS", "7244AA", "7312VP"
];
TECH_IDS.sort(); // Keep them sorted for the dropdown

try {
    if (typeof firebase === 'undefined' || typeof firebase.initializeApp === 'undefined') {
        throw new Error("Firebase SDK not loaded. Ensure Firebase scripts are correctly included.");
    }
    app = firebase.initializeApp(firebaseConfig);

    if (typeof app.firestore === 'undefined') {
        throw new Error("Firestore SDK not loaded or initialized correctly with the app.");
    }
    db = firebase.firestore();

    if (typeof app.auth === 'undefined') {
        throw new Error("Firebase Auth SDK not loaded or initialized correctly with the app.");
    }
    auth = firebase.auth();

    console.log("Firebase initialized successfully (App, Firestore, Auth)!");
    fetchAllowedEmails();

} catch (e) {
    console.error("CRITICAL: Error initializing Firebase: ", e.message);
    const loadingMsgDiv = document.getElementById('loading-auth-message');
    if (loadingMsgDiv) loadingMsgDiv.innerHTML = `<p style="color:red;">CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: ${e.message}</p>`;
    else alert("CRITICAL ERROR: Could not connect to Firebase. App will not function correctly. Error: " + e.message);
}

const FIX_CATEGORIES_ORDER = ["Fix1", "Fix2", "Fix3", "Fix4", "Fix5", "Fix6"];
const STATUS_ORDER = {
    'Available': 1, 'InProgressDay1': 2, 'Day1Ended_AwaitingNext': 3,
    'InProgressDay2': 4, 'Day2Ended_AwaitingNext': 5, 'InProgressDay3': 6,
    'Completed': 7, 'Reassigned_TechAbsent': 8
};
const NUM_TABLE_COLUMNS = 15;

let openAddNewProjectBtn, openTlDashboardBtn, openSettingsBtn, projectFormModal, tlDashboardModal, settingsModal,
    closeProjectFormBtn, closeTlDashboardBtn, closeSettingsBtn, newProjectForm, projectTableBody,
    tlDashboardContentElement, allowedEmailsList, addEmailInput, addEmailBtn;

let tlSummaryModal, closeTlSummaryBtn, tlSummaryContent, openTlSummaryBtn; // NEW: TL Summary modal elements

let projects = [];
let groupVisibilityState = {};
let isAppInitialized = false;
let firestoreListenerUnsubscribe = null;

// New variables for "per set" pagination, loaded from localStorage for persistence
let batchIdSelect, fixCategoryFilter, monthFilter;
let currentSelectedBatchId = localStorage.getItem('currentSelectedBatchId') || ""; //
let currentSelectedFixCategory = localStorage.getItem('currentSelectedFixCategory') || ""; //
let currentSelectedMonth = localStorage.getItem('currentSelectedMonth') || ""; //

// --- Loading Overlay Functions ---
function showLoading(message = "Loading...") {
    if (loadingOverlay) {
        loadingOverlay.querySelector('p').textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}
// --- End Loading Overlay Functions ---


function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatMillisToMinutes(millis) {
    return (millis === null || typeof millis !== 'number' || millis < 0) ? 'N/A' : Math.floor(millis / 60000);
}

function calculateDurationMs(startTime, endTime) {
    let startMillis = startTime;
    let endMillis = endTime;
    if (startTime && typeof startTime.toMillis === 'function') startMillis = startTime.toMillis();
    if (endTime && typeof endTime.toMillis === 'function') endMillis = endTime.toMillis();
    else if (typeof startTime === 'number' && typeof endTime === 'number') { /* proceed */ }
    else if (startTime && typeof startTime.toMillis === 'function' && typeof endTime === 'number') { /* endMillis is already a number */ }
    else if (typeof startTime === 'number' && endTime && typeof endTime.toMillis === 'function') { /* startMillis is already a number */ }
    else {
        if (!startTime || !endTime) return null;
        if (typeof startTime !== 'number' && !isNaN(new Date(startTime).getTime())) startMillis = new Date(startTime).getTime();
        if (typeof endTime !== 'number' && !isNaN(new Date(endTime).getTime())) endMillis = new Date(endTime).getTime();
    }
    return (!startMillis || !endMillis || endMillis < startMillis || isNaN(startMillis) || isNaN(endMillis)) ? null : endMillis - startMillis;
}

function loadGroupVisibilityState() {
    try {
        const savedState = localStorage.getItem('projectTrackerGroupVisibility');
        if (savedState) groupVisibilityState = JSON.parse(savedState);
        else groupVisibilityState = {};
    } catch (e) {
        console.error("Error parsing group visibility state from localStorage:", e);
        groupVisibilityState = {};
    }
}

function saveGroupVisibilityState() {
    try {
        localStorage.setItem('projectTrackerGroupVisibility', JSON.stringify(groupVisibilityState));
    } catch (lsError) {
        console.error("Error saving group visibility state to localStorage:", lsError);
        alert("Warning: Could not save your group visibility preferences.");
    }
}

async function fetchAllowedEmails() {
    showLoading("Fetching allowed emails...");
    if (!db) {
        console.error("Firestore (db) not initialized. Cannot fetch allowed emails.");
        hideLoading();
        return;
    }
    try {
        const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            allowedEmailsFromFirestore = docSnap.data().emails || [];
        } else {
            // Default allowed email if the document doesn't exist
            allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"];
        }
    } catch (error) {
        console.error("Error fetching allowed emails:", error);
        // Fallback to default in case of error
        allowedEmailsFromFirestore = ["ev.lorens.ebrado@gmail.com"];
    } finally {
        hideLoading();
    }
}

async function updateAllowedEmailsInFirestore(newEmailsArray) {
    showLoading("Updating allowed emails...");
    if (!db) {
        alert("Database not initialized! Cannot update allowed emails.");
        hideLoading();
        return false;
    }
    const docRef = db.doc(ALLOWED_EMAILS_DOC_REF_PATH);
    try {
        await docRef.set({
            emails: newEmailsArray
        });
        allowedEmailsFromFirestore = newEmailsArray;
        return true;
    } catch (error) {
        console.error("Error updating allowed emails in Firestore:", error);
        alert("Error saving allowed emails. Error: " + error.message);
        return false;
    } finally {
        hideLoading();
    }
}

async function initializeFirebaseAndLoadData() {
    showLoading("Loading projects...");
    if (!db) {
        projects = [];
        refreshAllViews();
        hideLoading();
        return;
    }
    if (firestoreListenerUnsubscribe) firestoreListenerUnsubscribe(); // Unsubscribe from previous listener

    loadGroupVisibilityState();

    let query = db.collection("projects");

    // --- Fetch and Populate Month Filter ---
    // Fetch all projects to determine unique months for filtering
    const allCreationTimestampsSnapshot = await db.collection("projects")
        .orderBy("creationTimestamp", "desc")
        .get();

    const uniqueMonths = new Set();
    allCreationTimestampsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.creationTimestamp) {
            const date = data.creationTimestamp.toDate();
            const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            uniqueMonths.add(yearMonth);
        }
    });

    // Clear and populate month filter dropdown
    monthFilter.innerHTML = '<option value="">All Months</option>';
    Array.from(uniqueMonths).sort((a, b) => b.localeCompare(a)).forEach(yearMonth => {
        const [year, monthNum] = yearMonth.split('-');
        const date = new Date(year, parseInt(monthNum) - 1, 1);
        const option = document.createElement('option');
        option.value = yearMonth;
        option.textContent = date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long'
        });
        monthFilter.appendChild(option);
    });

    // Set the month filter value from localStorage
    if (currentSelectedMonth && Array.from(uniqueMonths).includes(currentSelectedMonth)) {
        monthFilter.value = currentSelectedMonth;
    } else {
        // If stored value is invalid or no selection, reset and clear localStorage
        currentSelectedMonth = "";
        monthFilter.value = "";
        localStorage.setItem('currentSelectedMonth', "");
    }
    // --- End Fetch and Populate Month Filter ---


    // --- Fetch and Populate Batch ID Filter (dependent on Month Filter) ---
    let allBatchesQuery = db.collection("projects").orderBy("creationTimestamp", "desc");
    if (currentSelectedMonth) {
        const [year, monthNum] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999); // Last day of the month

        allBatchesQuery = allBatchesQuery
            .where("creationTimestamp", ">=", startDate)
            .where("creationTimestamp", "<=", endDate);
    }
    const allBatchesSnapshot = await allBatchesQuery.get();

    const uniqueBatchIds = new Set();
    const batchIdToName = {};

    allBatchesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.batchId) {
            uniqueBatchIds.add(data.batchId);
            batchIdToName[data.batchId] = data.baseProjectName;
        }
    });

    batchIdSelect.innerHTML = ''; // Clear existing options

    if (uniqueBatchIds.size === 0) {
        const option = document.createElement('option');
        option.value = "";
        option.textContent = "No batches available";
        option.disabled = true;
        option.selected = true;
        batchIdSelect.appendChild(option);
        currentSelectedBatchId = ""; // Reset selected batch ID
        localStorage.setItem('currentSelectedBatchId', ""); // Clear localStorage for batch
        projects = [];
        refreshAllViews();
        hideLoading();
        return;
    } else {
        const sortedUniqueBatchIds = Array.from(uniqueBatchIds).sort((a, b) => {
            const projectA = allBatchesSnapshot.docs.find(doc => doc.data().batchId === a);
            const projectB = allBatchesSnapshot.docs.find(doc => doc.data().batchId === b);
            if (projectA && projectB && projectA.data().creationTimestamp && projectB.data().creationTimestamp) {
                return projectB.data().creationTimestamp.toMillis() - projectA.data().creationTimestamp.toMillis();
            }
            return a.localeCompare(b);
        });

        // Add 'All Batches' option
        const allBatchesOption = document.createElement('option');
        allBatchesOption.value = "";
        allBatchesOption.textContent = "All Batches";
        batchIdSelect.appendChild(allBatchesOption);

        sortedUniqueBatchIds.forEach(batchId => {
            const option = document.createElement('option');
            option.value = batchId;
            option.textContent = `${batchIdToName[batchId] || 'Unknown Project'}`;
            batchIdSelect.appendChild(option);
        });

        // If no batch is currently selected OR the previously selected batch is not in the filtered list,
        // default to "All Batches" or the first one if "All Batches" is not suitable.
        if (!currentSelectedBatchId || !uniqueBatchIds.has(currentSelectedBatchId)) {
            currentSelectedBatchId = ""; // Default to "All Batches"
            localStorage.setItem('currentSelectedBatchId', "");
        }

        if (batchIdSelect.value !== currentSelectedBatchId) {
            batchIdSelect.value = currentSelectedBatchId;
        }
    }
    // --- End Fetch and Populate Batch ID Filter ---

    // --- Populate Fix Category Filter ---
    // Populate the Fix Category filter dropdown from FIX_CATEGORIES_ORDER
    fixCategoryFilter.innerHTML = '<option value="">All Categories</option>';
    FIX_CATEGORIES_ORDER.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        fixCategoryFilter.appendChild(option);
    });

    // Set the Fix Category filter value from localStorage
    if (currentSelectedFixCategory && FIX_CATEGORIES_ORDER.includes(currentSelectedFixCategory)) {
        fixCategoryFilter.value = currentSelectedFixCategory;
    } else {
        currentSelectedFixCategory = "";
        fixCategoryFilter.value = "";
        localStorage.setItem('currentSelectedFixCategory', "");
    }
    // --- End Populate Fix Category Filter ---


    // Apply filters to the main project query
    if (currentSelectedBatchId) {
        query = query.where("batchId", "==", currentSelectedBatchId);
    }
    if (currentSelectedFixCategory) {
        query = query.where("fixCategory", "==", currentSelectedFixCategory);
    }
    if (currentSelectedMonth) {
        const [year, monthNum] = currentSelectedMonth.split('-');
        const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999); // Last day of the month

        query = query
            .where("creationTimestamp", ">=", startDate)
            .where("creationTimestamp", "<=", endDate);
    }

    query = query.orderBy("fixCategory").orderBy("areaTask");

    try {
        firestoreListenerUnsubscribe = query.onSnapshot((querySnapshot) => {
            const firebaseProjects = [];
            querySnapshot.forEach((doc) => {
                if (doc.exists && typeof doc.data === 'function') {
                    firebaseProjects.push({
                        id: doc.id,
                        ...doc.data()
                    });
                }
            });

            projects = firebaseProjects;

            // Initialize default visibility and other fields if not present
            projects.forEach(p => {
                const groupStateKey = `${p.batchId}_${p.fixCategory}`;
                if (groupVisibilityState[groupStateKey] === undefined) groupVisibilityState[groupStateKey] = {
                    isExpanded: true
                };
                if (p.breakDurationMinutes === undefined) p.breakDurationMinutes = 0;
                if (p.additionalMinutesManual === undefined) p.additionalMinutesManual = 0;
                if (p.startTimeDay3 === undefined) p.startTimeDay3 = null;
                if (p.finishTimeDay3 === undefined) p.finishTimeDay3 = null;
                if (p.durationDay3Ms === undefined) p.durationDay3Ms = null;
            });

            refreshAllViews();
        }, (error) => {
            console.error("Error fetching projects: ", error);
            projects = [];
            refreshAllViews();
            alert("Error loading projects: " + error.message); // Inform user about data loading error
        });
    } catch (fbError) {
        console.error("Error setting up Firebase listener: ", fbError);
        alert("CRITICAL ERROR: Could not set up real-time project updates. Error: " + fbError.message);
    } finally {
        hideLoading();
    }
}


function setupDOMReferences() {
    openAddNewProjectBtn = document.getElementById('openAddNewProjectBtn');
    openTlDashboardBtn = document.getElementById('openTlDashboardBtn');
    openSettingsBtn = document.getElementById('openSettingsBtn');
    projectFormModal = document.getElementById('projectFormModal');
    tlDashboardModal = document.getElementById('tlDashboardModal');
    settingsModal = document.getElementById('settingsModal');
    closeProjectFormBtn = document.getElementById('closeProjectFormBtn');
    closeTlDashboardBtn = document.getElementById('closeTlDashboardBtn');
    closeSettingsBtn = document.getElementById('closeSettingsBtn');
    newProjectForm = document.getElementById('newProjectForm');
    projectTableBody = document.getElementById('projectTableBody');
    tlDashboardContentElement = document.getElementById('tlDashboardContent');
    allowedEmailsList = document.getElementById('allowedEmailsList');
    addEmailInput = document.getElementById('addEmailInput');
    addEmailBtn = document.getElementById('addEmailBtn');

    tlSummaryModal = document.getElementById('tlSummaryModal');
    closeTlSummaryBtn = document.getElementById('closeTlSummaryBtn');
    tlSummaryContent = document.getElementById('tlSummaryContent');
    openTlSummaryBtn = document.getElementById('openTlSummaryBtn');

    loadingOverlay = document.getElementById('loadingOverlay');

    batchIdSelect = document.getElementById('batchIdSelect');
    fixCategoryFilter = document.getElementById('fixCategoryFilter');
    monthFilter = document.getElementById('monthFilter');
}

function setupAuthRelatedDOMReferences() {
    signInBtn = document.getElementById('signInBtn');
    signOutBtn = document.getElementById('signOutBtn');
    userInfoDisplayDiv = document.getElementById('user-info-display');
    userNameP = document.getElementById('userName');
    userEmailP = document.getElementById('userEmail');
    userPhotoImg = document.getElementById('userPhoto');
    appContentDiv = document.getElementById('app-content');
    loadingAuthMessageDiv = document.getElementById('loading-auth-message');
}

function attachEventListeners() {
    // Add New Project Button & Modal
    if (openAddNewProjectBtn) openAddNewProjectBtn.onclick = () => {
        const pin = prompt("Enter PIN to add new tracker:");
        if (pin !== "1234") {
            alert("Incorrect PIN.");
            return;
        }
        projectFormModal.style.display = 'block';
    };
    if (closeProjectFormBtn) closeProjectFormBtn.onclick = () => {
        newProjectForm.reset(); // Reset form on close
        projectFormModal.style.display = 'none';
    };

    // TL Dashboard Button & Modal
    if (openTlDashboardBtn) {
        openTlDashboardBtn.onclick = () => {
            const pin = prompt("Enter PIN to access Project Settings:");
            if (pin === TL_DASHBOARD_PIN) {
                tlDashboardModal.style.display = 'block';
                renderTLDashboard();
            } else {
                alert("Incorrect PIN.");
            }
        };
    }
    if (closeTlDashboardBtn) closeTlDashboardBtn.onclick = () => {
        tlDashboardModal.style.display = 'none';
    };

    // Settings Button & Modal
    if (openSettingsBtn) openSettingsBtn.onclick = () => {
        const pin = prompt("Enter PIN to access User Settings:");
        if (pin !== "1234") {
            alert("Incorrect PIN.");
            return;
        }
        settingsModal.style.display = 'block';
        renderAllowedEmailsList();
    };
    if (closeSettingsBtn) closeSettingsBtn.onclick = () => {
        settingsModal.style.display = 'none';
    };

    // Add Email Button (within Settings)
    if (addEmailBtn) addEmailBtn.onclick = handleAddEmail;

    // TL Summary Modal
    if (openTlSummaryBtn) openTlSummaryBtn.onclick = () => {
        tlSummaryModal.style.display = 'block';
        generateTlSummaryData();
    };
    if (closeTlSummaryBtn) closeTlSummaryBtn.onclick = () => {
        tlSummaryModal.style.display = 'none';
    };

    // Filter Change Listeners
    if (batchIdSelect) {
        batchIdSelect.onchange = (event) => {
            currentSelectedBatchId = event.target.value;
            localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId); // Save to localStorage
            initializeFirebaseAndLoadData();
        };
    }
    if (fixCategoryFilter) {
        fixCategoryFilter.onchange = (event) => {
            currentSelectedFixCategory = event.target.value;
            localStorage.setItem('currentSelectedFixCategory', currentSelectedFixCategory); // Save to localStorage
            initializeFirebaseAndLoadData();
        };
    }
    if (monthFilter) {
        monthFilter.onchange = (event) => {
            currentSelectedMonth = event.target.value;
            localStorage.setItem('currentSelectedMonth', currentSelectedMonth); // Save to localStorage
            currentSelectedBatchId = ""; // Reset selected batch when month changes
            localStorage.setItem('currentSelectedBatchId', ""); // Clear localStorage for batch when month changes
            initializeFirebaseAndLoadData();
        };
    }

    // Close modals on outside click
    if (typeof window !== 'undefined') {
        window.onclick = (event) => {
            if (event.target == projectFormModal) projectFormModal.style.display = 'none';
            if (event.target == tlDashboardModal) tlDashboardModal.style.display = 'none';
            if (event.target == settingsModal) settingsModal.style.display = 'none';
            if (event.target == tlSummaryModal) tlSummaryModal.style.display = 'none';
        };
    }
    // New Project Form Submission
    if (newProjectForm) newProjectForm.addEventListener('submit', handleAddProjectSubmit);

    // Firebase Auth Event Listeners
    setupAuthEventListeners();
}

async function logActivity(action, details = {}) {
    if (!db || !auth.currentUser) {
        console.warn("Firestore or authenticated user not available for logging activity.");
        return;
    }
    try {
        await db.collection("activity_logs").add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            userId: auth.currentUser.uid,
            userEmail: auth.currentUser.email,
            action: action,
            details: details
        });
        console.log("Activity logged:", action, details);
    } catch (error) {
        console.error("Error logging activity:", error);
    }
}


async function handleAddProjectSubmit(e) {
    e.preventDefault();
    showLoading("Adding project(s)...");
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }
    const fixCategory = document.getElementById('fixCategorySelect').value;
    const numRows = parseInt(document.getElementById('numRows').value, 10);
    const baseProjectNameVal = document.getElementById('baseProjectName').value.trim();
    const gsd = document.getElementById('gsd').value;

    if (!baseProjectNameVal || isNaN(numRows) || numRows < 1) {
        alert("Invalid input. Please ensure Project Name is not empty and Number of Tasks is at least 1.");
        hideLoading();
        return;
    }

    const currentBatchId = "batch_" + generateId();
    const batchCreationTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const fbBatch = db.batch();

    try {
        for (let i = 1; i <= numRows; i++) {
            const newProjectData = {
                batchId: currentBatchId,
                creationTimestamp: batchCreationTimestamp,
                fixCategory: fixCategory,
                baseProjectName: baseProjectNameVal,
                areaTask: `Area${String(i).padStart(2, '0')}`,
                gsd: gsd,
                assignedTo: "",
                techNotes: "",
                status: 'Available',
                startTimeDay1: null,
                finishTimeDay1: null,
                durationDay1Ms: null,
                startTimeDay2: null,
                finishTimeDay2: null,
                durationDay2Ms: null,
                startTimeDay3: null,
                finishTimeDay3: null,
                durationDay3Ms: null,
                releasedToNextStage: false,
                lastModifiedTimestamp: batchCreationTimestamp,
                isReassigned: false,
                originalProjectId: null,
                breakDurationMinutes: 0,
                additionalMinutesManual: 0
            };
            fbBatch.set(db.collection("projects").doc(), newProjectData);
        }
        await fbBatch.commit();
        logActivity('Added New Project(s)', {
            fixCategory: fixCategory,
            numRows: numRows,
            baseProjectName: baseProjectNameVal,
            gsd: gsd,
            batchId: currentBatchId.split('_')[1]
        });
        newProjectForm.reset();
        currentSelectedBatchId = currentBatchId;
        localStorage.setItem('currentSelectedBatchId', currentSelectedBatchId); // Save newly created batch as selected
        currentSelectedMonth = ""; // Clear month filter so new batch is visible
        localStorage.setItem('currentSelectedMonth', ""); // Also update localStorage
        currentSelectedFixCategory = ""; // Clear fix category filter
        localStorage.setItem('currentSelectedFixCategory', ""); // Also update localStorage
        initializeFirebaseAndLoadData(); // Re-load data to show the new batch
    } catch (error) {
        console.error("Error adding projects: ", error);
        alert("Error adding projects: " + error.message);
    } finally {
        projectFormModal.style.display = 'none';
        hideLoading();
    }
}

async function getManageableBatches() {
    if (!db) {
        console.error("DB not initialized for getManageableBatches.");
        return [];
    }
    showLoading("Loading batches for dashboard...");
    try {
        const querySnapshot = await db.collection("projects").get();
        const allBatchesInfo = {};
        querySnapshot.forEach(doc => {
            const p = doc.data();
            if (p && p.batchId) {
                if (!allBatchesInfo[p.batchId]) {
                    allBatchesInfo[p.batchId] = {
                        batchId: p.batchId,
                        baseProjectName: p.baseProjectName || "N/A",
                        tasksByFix: {}
                    };
                }
                if (p.fixCategory) {
                    if (!allBatchesInfo[p.batchId].tasksByFix[p.fixCategory]) {
                        allBatchesInfo[p.batchId].tasksByFix[p.fixCategory] = [];
                    }
                    allBatchesInfo[p.batchId].tasksByFix[p.fixCategory].push(p);
                }
            }
        });
        return Object.values(allBatchesInfo);
    } catch (error) {
        console.error("Error fetching batches for dashboard:", error);
        alert("Error fetching batches for dashboard: " + error.message);
        return [];
    } finally {
        hideLoading();
    }
}


async function renderTLDashboard() {
    if (!tlDashboardContentElement) {
        console.error("tlDashboardContentElement not found.");
        return;
    }
    tlDashboardContentElement.innerHTML = '';
    const manageableBatches = await getManageableBatches();
    if (manageableBatches.length === 0) {
        tlDashboardContentElement.innerHTML = '<p>No project batches found.</p>';
        return;
    }

    manageableBatches.forEach(batch => {
        if (!batch || !batch.batchId) return;
        const batchDiv = document.createElement('div');
        batchDiv.classList.add('dashboard-batch-item');
        const title = document.createElement('h4');
        title.textContent = `Batch: ${batch.baseProjectName || 'Unknown'} (ID: ${batch.batchId.split('_')[1] || 'N/A'})`;
        batchDiv.appendChild(title);
        const stagesPresentP = document.createElement('p');
        const presentFixCategories = batch.tasksByFix ? Object.keys(batch.tasksByFix).sort((a, b) => FIX_CATEGORIES_ORDER.indexOf(a) - FIX_CATEGORIES_ORDER.indexOf(b)) : [];
        stagesPresentP.innerHTML = `<strong>Stages Present:</strong> ${presentFixCategories.join(', ') || 'None'}`;
        batchDiv.appendChild(stagesPresentP);
        const releaseActionsDiv = document.createElement('div');
        releaseActionsDiv.classList.add('dashboard-batch-actions-release');
        let latestFixCategoryForBatch = "";
        let allTasksInLatestStageReadyForRelease = false;
        let alreadyReleasedFromLatestStage = true;
        if (batch.tasksByFix) {
            FIX_CATEGORIES_ORDER.slice().reverse().forEach(fixCat => {
                if (batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0 && !latestFixCategoryForBatch) {
                    latestFixCategoryForBatch = fixCat;
                    alreadyReleasedFromLatestStage = batch.tasksByFix[fixCat].every(t => t && t.releasedToNextStage && t.status !== 'Reassigned_TechAbsent');
                    if (!alreadyReleasedFromLatestStage) {
                        allTasksInLatestStageReadyForRelease = batch.tasksByFix[fixCat]
                            .filter(t => t.status !== 'Reassigned_TechAbsent')
                            .every(t => t && (t.status === 'Completed' || t.status === 'Day1Ended_AwaitingNext' || t.status === 'Day2Ended_AwaitingNext'));
                    }
                }
            });
        }
        if (latestFixCategoryForBatch && !alreadyReleasedFromLatestStage) {
            const currentFixIdx = FIX_CATEGORIES_ORDER.indexOf(latestFixCategoryForBatch);
            if (currentFixIdx < FIX_CATEGORIES_ORDER.length - 1) {
                const nextFixCategory = FIX_CATEGORIES_ORDER[currentFixIdx + 1];
                const releaseBtn = document.createElement('button');
                releaseBtn.textContent = `Release to ${nextFixCategory}`;
                releaseBtn.classList.add('btn', 'btn-release');
                if (!allTasksInLatestStageReadyForRelease) {
                    releaseBtn.disabled = true;
                    releaseBtn.title = `Not all active tasks in ${latestFixCategoryForBatch} are 'Completed' or 'Day 1 Ended' or 'Day 2 Ended'.`;
                }
                releaseBtn.onclick = () => releaseBatchToNextFix(batch.batchId, latestFixCategoryForBatch, nextFixCategory);
                releaseActionsDiv.appendChild(releaseBtn);
            }
        } else if (alreadyReleasedFromLatestStage && latestFixCategoryForBatch && FIX_CATEGORIES_ORDER.indexOf(latestFixCategoryForBatch) < FIX_CATEGORIES_ORDER.length - 1) {
            const releasedInfoP = document.createElement('p');
            releasedInfoP.innerHTML = `<small><em>(Active tasks released from ${latestFixCategoryForBatch})</em></small>`;
            releaseActionsDiv.appendChild(releasedInfoP);
        }
        batchDiv.appendChild(releaseActionsDiv);
        const deleteActionsDiv = document.createElement('div');
        deleteActionsDiv.classList.add('dashboard-batch-actions-delete');
        if (batch.tasksByFix) {
            FIX_CATEGORIES_ORDER.forEach(fixCat => {
                if (batch.tasksByFix[fixCat] && batch.tasksByFix[fixCat].length > 0) {
                    const deleteFixBtn = document.createElement('button');
                    deleteFixBtn.textContent = `Delete ${fixCat} Tasks`;
                    deleteFixBtn.classList.add('btn', 'btn-danger');
                    deleteFixBtn.onclick = () => {
                        if (confirm(`Are you sure you want to delete all ${fixCat} tasks for batch '${batch.baseProjectName || 'Unknown'}'? IRREVERSIBLE.`)) deleteSpecificFixTasksForBatch(batch.batchId, fixCat);
                    };
                    deleteActionsDiv.appendChild(deleteFixBtn);
                }
            });
        }
        const deleteAllBtn = document.createElement('button');
        deleteAllBtn.textContent = 'Delete ALL Tasks for this Batch';
        deleteAllBtn.classList.add('btn', 'btn-danger');
        deleteAllBtn.onclick = () => {
            if (confirm(`Are-you sure you want to delete ALL tasks for batch '${batch.baseProjectName || 'Unknown'}'? IRREVERSIBLE.`)) deleteProjectBatch(batch.batchId);
        };
        deleteActionsDiv.appendChild(deleteAllBtn);
        batchDiv.appendChild(deleteActionsDiv);
        tlDashboardContentElement.appendChild(batchDiv);
    });
}

async function releaseBatchToNextFix(batchId, currentFixCategory, nextFixCategory) {
    showLoading(`Releasing ${currentFixCategory} tasks...`);
    if (!db) {
        alert("Database not initialized!");
        hideLoading();
        return;
    }
    try {
        const sourceTasksSnapshot = await db.collection("projects").where("batchId", "==", batchId).where("fixCategory", "==", currentFixCategory).where("releasedToNextStage", "==", false).get();
        if (sourceTasksSnapshot.empty) {
            alert("No active tasks to release in the current stage for this batch.");
            refreshAllViews();
            return;
        }
        const sourceBatchTasks = [];
        sourceTasksSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.status !== 'Reassigned_TechAbsent') sourceBatchTasks.push({
                id: doc.id,
                ...data
            });
        });
        if (sourceBatchTasks.length === 0) {
            alert("No active tasks to release after filtering out reassigned ones.");
            refreshAllViews();
            return;
        }
        const allReadyForRelease = sourceBatchTasks.every(p => p && (p.status === 'Completed' || p.status === 'Day1Ended_AwaitingNext' || p.status === 'Day2Ended_AwaitingNext'));
        if (!allReadyForRelease) {
            alert(`Not all active tasks in ${currentFixCategory} are 'Completed', 'Day 1 Ended', or 'Day 2 Ended'. Cannot release.`);
            return;
        }
        const releaseTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        const fbBatch = db.batch();
        for (const sourceTask of sourceBatchTasks) {
            if (!sourceTask || !sourceTask.id) continue;
            // Check if a task for the next stage already exists for this areaTask within the batch
            const q = db.collection("projects").where("batchId", "==", sourceTask.batchId).where("areaTask", "==", sourceTask.areaTask).where("fixCategory", "==", nextFixCategory);
            const existingNextStageTaskSnapshot = await q.get();
            if (existingNextStageTaskSnapshot.empty) {
                // Only create new task if one doesn't already exist for the next stage
                const newReleasedTaskData = {
                    batchId: sourceTask.batchId,
                    creationTimestamp: sourceTask.creationTimestamp,
                    fixCategory: nextFixCategory,
                    baseProjectName: sourceTask.baseProjectName,
                    areaTask: sourceTask.areaTask,
                    gsd: sourceTask.gsd,
                    assignedTo: "", // New task starts unassigned
                    techNotes: "", // New task starts with empty notes
                    status: 'Available', // New task starts as available
                    startTimeDay1: null,
                    finishTimeDay1: null,
                    durationDay1Ms: null,
                    startTimeDay2: null,
                    finishTimeDay2: null,
                    durationDay2Ms: null,
                    startTimeDay3: null,
                    finishTimeDay3: null,
                    durationDay3Ms: null,
                    releasedToNextStage: false,
                    lastModifiedTimestamp: releaseTimestamp,
                    isReassigned: false,
                    originalProjectId: sourceTask.id, // Link to the task it was released from
                    breakDurationMinutes: 0,
                    additionalMinutesManual: 0
                };
                fbBatch.set(db.collection("projects").doc(), newReleasedTaskData);
            }
            // Mark the source task as released
            fbBatch.update(db.collection("projects").doc(sourceTask.id), {
                releasedToNextStage: true,
                lastModifiedTimestamp: releaseTimestamp
            });
        }
        await fbBatch.commit();
        logActivity(`Released Batch to Next Fix: ${currentFixCategory} -> ${nextFixCategory}`, {
            batchId: batchId.split('_')[1],
            currentFixCategory: currentFixCategory,
            nextFixCategory: nextFixCategory
        });
        initializeFirebaseAndLoadData(); // Re-load to reflect changes
    } catch (error) {
        console.error("Error releasing batch:", error);
        alert("Error releasing batch: " + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteProjectBatch(batchIdToDelete) {
    showLoading("Deleting batch...");
    if (!db || !batchIdToDelete) {
        alert("Invalid request to delete batch.");
        hideLoading();
        return;
    }
    try {
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchIdToDelete).get();
        if (querySnapshot.empty) {
            console.log("No tasks found for batch ID to delete:", batchIdToDelete);
            hideLoading();
            return;
        }
        const fbBatch = db.batch();
        querySnapshot.forEach(doc => fbBatch.delete(doc.ref));
        await fbBatch.commit();
        logActivity('Deleted Entire Project Batch', {
            batchId: batchIdToDelete.split('_')[1]
        });
        // After deletion, clear the selected batch if it was the one deleted
        if (currentSelectedBatchId === batchIdToDelete) {
            currentSelectedBatchId = "";
            localStorage.setItem('currentSelectedBatchId', "");
        }
        initializeFirebaseAndLoadData(); // Re-load to reflect deletion
        renderTLDashboard(); // Refresh dashboard
    } catch (error) {
        console.error(`Error deleting batch ${batchIdToDelete}:`, error);
        alert("Error deleting batch: " + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteSpecificFixTasksForBatch(batchIdToDelete, fixCategoryToDelete) {
    showLoading(`Deleting ${fixCategoryToDelete} tasks...`);
    if (!db || !batchIdToDelete || !fixCategoryToDelete) {
        alert("Invalid request to delete specific fix tasks.");
        hideLoading();
        return;
    }
    try {
        const querySnapshot = await db.collection("projects").where("batchId", "==", batchIdToDelete).where("fixCategory", "==", fixCategoryToDelete).get();
        if (querySnapshot.empty) {
            console.log(`No ${fixCategoryToDelete} tasks found for batch ID ${batchIdToDelete} to delete.`);
            hideLoading();
            return;
        }
        const fbBatch = db.batch();
        querySnapshot.forEach(doc => fbBatch.delete(doc.ref));
        await fbBatch.commit();
        logActivity(`Deleted Specific Fix Tasks for Batch: ${fixCategoryToDelete}`, {
            batchId: batchIdToDelete.split('_')[1],
            fixCategory: fixCategoryToDelete
        });
        initializeFirebaseAndLoadData(); // Re-load to reflect deletion
        renderTLDashboard(); // Refresh dashboard
    } catch (error) {
        console.error(`Error deleting ${fixCategoryToDelete} for batch ${batchIdToDelete}:`, error);
        alert("Error deleting specific fix tasks: " + error.message);
    } finally {
        hideLoading();
    }
}

function renderProjects() {
    if (!projectTableBody) {
        console.error("CRITICAL: projectTableBody not found.");
        return;
    }
    projectTableBody.innerHTML = '';
    const projectsToRender = [...projects];

    projectsToRender.sort((a, b) => {
        if (!a || !b) return 0;
        const fixOrderA = FIX_CATEGORIES_ORDER.indexOf(a.fixCategory || "");
        const fixOrderB = FIX_CATEGORIES_ORDER.indexOf(b.fixCategory || "");
        if (fixOrderA < fixOrderB) return -1;
        if (fixOrderA > fixOrderB) return 1;
        if ((a.areaTask || "") < (b.areaTask || "")) return -1;
        if ((a.areaTask || "") > (b.areaTask || "")) return 1;
        const statusAVal = STATUS_ORDER[a.status || ""] || 99;
        const statusBVal = STATUS_ORDER[b.status || ""] || 99;
        if (statusAVal < statusBVal) return -1;
        if (statusAVal > statusBVal) return 1;
        return 0;
    });

    let currentBatchIdForDisplay = null;
    let currentFixCategoryForHeader = null;

    projectsToRender.forEach(project => {
        if (!project || !project.id || !project.batchId || !project.fixCategory) {
            return;
        }

        if (project.batchId !== currentBatchIdForDisplay) {
            currentBatchIdForDisplay = project.batchId;
            currentFixCategoryForHeader = null; // Reset fix category header for new batch
            const batchHeaderRow = projectTableBody.insertRow();
            batchHeaderRow.classList.add('batch-header-row');
            const batchHeaderCell = batchHeaderRow.insertCell();
            batchHeaderCell.setAttribute('colspan', NUM_TABLE_COLUMNS.toString());
            batchHeaderCell.textContent = `Project Batch: ${project.baseProjectName || 'Unknown'} (ID: ${project.batchId.split('_')[1] || 'N/A'})`;
        }
        if (project.fixCategory !== currentFixCategoryForHeader) {
            currentFixCategoryForHeader = project.fixCategory;
            const groupStateKey = `${project.batchId}_${currentFixCategoryForHeader}`;
            if (groupVisibilityState[groupStateKey] === undefined) groupVisibilityState[groupStateKey] = {
                isExpanded: true
            }; // Default to expanded
            const groupHeaderRow = projectTableBody.insertRow();
            groupHeaderRow.classList.add('fix-group-header');
            const groupHeaderCell = groupHeaderRow.insertCell();
            groupHeaderCell.setAttribute('colspan', NUM_TABLE_COLUMNS.toString());
            const toggleBtn = document.createElement('button');
            toggleBtn.classList.add('btn', 'btn-group-toggle');
            const isExpanded = groupVisibilityState[groupStateKey]?.isExpanded !== false; // Default to true if not set
            toggleBtn.textContent = isExpanded ? '−' : '+';
            toggleBtn.title = isExpanded ? `Collapse ${currentFixCategoryForHeader}` : `Expand ${currentFixCategoryForHeader}`;
            groupHeaderCell.appendChild(document.createTextNode(`${currentFixCategoryForHeader} `));
            groupHeaderCell.appendChild(toggleBtn);
            // Use event delegation for the header to avoid issues with direct onclick on dynamic content
            groupHeaderCell.onclick = (e) => {
                // Ensure click is on the header or its immediate children (like the toggle button)
                if (e.target === toggleBtn || e.target === groupHeaderCell || groupHeaderCell.contains(e.target)) {
                    if (groupVisibilityState[groupStateKey]) {
                        groupVisibilityState[groupStateKey].isExpanded = !groupVisibilityState[groupStateKey].isExpanded;
                        saveGroupVisibilityState();
                        renderProjects(); // Re-render to apply visibility changes
                    }
                }
            };
        }

        const row = projectTableBody.insertRow();
        const currentGroupStateKeyForRow = `${project.batchId}_${project.fixCategory}`;
        if (!(groupVisibilityState[currentGroupStateKeyForRow]?.isExpanded !== false)) row.classList.add('hidden-group-row'); // Hide if collapsed
        if (project.fixCategory) row.classList.add(`${project.fixCategory.toLowerCase()}-row`); // Add class for styling
        if (project.isReassigned) row.classList.add('reassigned-task-highlight'); // Highlight reassigned tasks

        row.insertCell().textContent = project.fixCategory || 'N/A';
        const baseNameCell = row.insertCell();
        baseNameCell.textContent = project.baseProjectName || 'N/A';
        baseNameCell.classList.add('wrap-text');
        row.insertCell().textContent = project.areaTask || 'N/A';
        row.insertCell().textContent = project.gsd || 'N/A';

        const assignedToCell = row.insertCell();
        const assignedToSelect = document.createElement('select');
        assignedToSelect.classList.add('assigned-to-select');
        assignedToSelect.disabled = project.status === 'Reassigned_TechAbsent'; // Disable if reassigned

        const unassignedOption = document.createElement('option');
        unassignedOption.value = "";
        unassignedOption.textContent = "Select Tech ID";
        assignedToSelect.appendChild(unassignedOption);

        TECH_IDS.forEach(techId => {
            const option = document.createElement('option');
            option.value = techId;
            option.textContent = techId;
            assignedToSelect.appendChild(option);
        });

        assignedToSelect.value = project.assignedTo || ""; // Set current assignment

        assignedToSelect.onchange = async (event) => {
            showLoading("Updating assignment...");
            const newTechId = event.target.value;
            const oldTechId = project.assignedTo || "";
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update assignment.");
                event.target.value = project.assignedTo || ''; // Revert dropdown
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    assignedTo: newTechId,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                logActivity('Changed Assigned Tech', {
                    projectId: project.id,
                    projectName: project.baseProjectName + ' ' + project.areaTask,
                    oldAssignedTo: oldTechId,
                    newAssignedTo: newTechId
                });
                project.assignedTo = newTechId; // Update local project object
            } catch (error) {
                console.error("Error updating assignedTo:", error);
                alert("Error updating assignment: " + error.message);
                event.target.value = oldTechId; // Revert dropdown on error
            } finally {
                hideLoading();
            }
        };
        assignedToCell.appendChild(assignedToSelect);

        const statusCell = row.insertCell();
        const statusSpan = document.createElement('span');
        statusSpan.classList.add('status');
        let statusText = (project.status || "Unknown").replace(/([A-Z])(?=[a-z0-9_])/g, ' $1').trim();
        // Improve readability for specific statuses
        if (project.status === "Day1Ended_AwaitingNext") statusText = "Started Day 1 Ended";
        if (project.status === "Day2Ended_AwaitingNext") statusText = "Started Day 2 Ended";
        if (project.status === "Reassigned_TechAbsent") statusText = "Re-Assigned";
        statusSpan.textContent = statusText;
        statusSpan.classList.add(`status-${(project.status || "unknown").toLowerCase()}`);
        statusCell.appendChild(statusSpan);

        const timeFormatOptions = {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        };
        // Convert Firestore Timestamps to Date objects for display
        let d1s = project.startTimeDay1,
            d1f = project.finishTimeDay1,
            d2s = project.startTimeDay2,
            d2f = project.finishTimeDay2,
            d3s = project.startTimeDay3,
            d3f = project.finishTimeDay3;

        try {
            if (d1s && typeof d1s.toDate === 'function') d1s = d1s.toDate();
            else if (d1s) d1s = new Date(d1s);
            else d1s = null;
            if (d1f && typeof d1f.toDate === 'function') d1f = d1f.toDate();
            else if (d1f) d1f = new Date(d1f);
            else d1f = null;
            if (d2s && typeof d2s.toDate === 'function') d2s = d2s.toDate();
            else if (d2s) d2s = new Date(d2s);
            else d2s = null;
            if (d2f && typeof d2f.toDate === 'function') d2f = d2f.toDate();
            else if (d2f) d2f = new Date(d2f);
            else d2f = null;
            if (d3s && typeof d3s.toDate === 'function') d3s = d3s.toDate();
            else if (d3s) d3s = new Date(d3s);
            else d3s = null;
            if (d3f && typeof d3f.toDate === 'function') d3f = d3f.toDate();
            else if (d3f) d3f = new Date(d3f);
            else d3f = null;

        } catch (dateError) {
            console.warn("Error converting Firestore timestamp to Date:", dateError);
            d1s = d1f = d2s = d2f = d3s = d3f = null;
        }

        row.insertCell().textContent = d1s && !isNaN(d1s) ? d1s.toLocaleTimeString('en-US', timeFormatOptions) : '-';
        row.insertCell().textContent = d1f && !isNaN(d1f) ? d1f.toLocaleTimeString('en-US', timeFormatOptions) : '-';
        row.insertCell().textContent = d2s && !isNaN(d2s) ? d2s.toLocaleTimeString('en-US', timeFormatOptions) : '-';
        row.insertCell().textContent = d2f && !isNaN(d2f) ? d2f.toLocaleTimeString('en-US', timeFormatOptions) : '-';
        row.insertCell().textContent = d3s && !isNaN(d3s) ? d3s.toLocaleTimeString('en-US', timeFormatOptions) : '-';
        row.insertCell().textContent = d3f && !isNaN(d3f) ? d3f.toLocaleTimeString('en-US', timeFormatOptions) : '-';

        let totalRawDurationMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
        let breakToSubtractMs = (project.breakDurationMinutes || 0) * 60000;
        let additionalManualMs = (project.additionalMinutesManual || 0) * 60000;
        let durationAfterBreakMs = Math.max(0, totalRawDurationMs - breakToSubtractMs);
        let finalTotalDurationMs = durationAfterBreakMs + additionalManualMs;
        // If all duration components are zero, display 'N/A'
        if (totalRawDurationMs === 0 && (project.breakDurationMinutes || 0) === 0 && (project.additionalMinutesManual || 0) === 0) {
            finalTotalDurationMs = null;
        }
        const totalDurationCell = row.insertCell();
        totalDurationCell.textContent = formatMillisToMinutes(finalTotalDurationMs);
        totalDurationCell.classList.add('total-duration-column');

        const techNotesCell = row.insertCell();
        const techNotesInput = document.createElement('textarea');
        techNotesInput.value = project.techNotes || '';
        techNotesInput.placeholder = 'Notes';
        techNotesInput.classList.add('tech-notes-input');
        techNotesInput.rows = 1; // Start with one row
        techNotesInput.id = `techNotes_${project.id}`;
        techNotesInput.disabled = project.status === 'Reassigned_TechAbsent';
        techNotesInput.onchange = async (event) => {
            showLoading("Updating tech notes...");
            const newVal = event.target.value;
            const oldVal = project.techNotes || '';
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update notes.");
                event.target.value = project.techNotes || ''; // Revert value on error
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    techNotes: newVal,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                logActivity('Updated Tech Notes', {
                    projectId: project.id,
                    projectName: project.baseProjectName + ' ' + project.areaTask,
                    oldNotes: oldVal,
                    newNotes: newVal.length > 50 ? newVal.substring(0, 50) + '...' : newVal // Log truncated new notes
                });
                project.techNotes = newVal; // Update local project object
            } catch (error) {
                console.error("Error updating techNotes:", error);
                alert("Error updating tech notes: " + error.message);
                event.target.value = oldVal; // Revert value on error
            } finally {
                hideLoading();
            }
        };
        techNotesCell.appendChild(techNotesInput);

        const actionsCell = row.insertCell();
        const btnContainer = document.createElement('div');
        btnContainer.classList.add('action-buttons-container'); // Add a class for styling

        // Break Duration Select
        const breakSelect = document.createElement('select');
        breakSelect.classList.add('break-select');
        breakSelect.id = `breakSelect_${project.id}`;
        breakSelect.title = "Select break time to deduct";
        breakSelect.disabled = project.status === 'Reassigned_TechAbsent';
        let defaultBreakOption = document.createElement('option');
        defaultBreakOption.value = '0';
        defaultBreakOption.textContent = 'No Break';
        breakSelect.appendChild(defaultBreakOption);
        let option15Min = document.createElement('option');
        option15Min.value = '15';
        option15Min.textContent = '15m Break';
        breakSelect.appendChild(option15Min);
        let option60Min = document.createElement('option');
        option60Min.value = '60';
        option60Min.textContent = '1h Break';
        breakSelect.appendChild(option60Min);
        let option90Min = document.createElement('option');
        option90Min.value = '90';
        option90Min.textContent = '1h30m Break';
        breakSelect.appendChild(option90Min);
        breakSelect.value = (typeof project.breakDurationMinutes === 'number') ? project.breakDurationMinutes.toString() : '0';
        breakSelect.onchange = async (event) => {
            showLoading("Updating break duration...");
            const selectedBreakMinutes = parseInt(event.target.value, 10);
            const oldBreakMinutes = project.breakDurationMinutes || 0;
            if (!db || !project.id) {
                alert("Database or project ID missing. Cannot update break duration.");
                event.target.value = oldBreakMinutes.toString(); // Revert on error
                hideLoading();
                return;
            }
            try {
                await db.collection("projects").doc(project.id).update({
                    breakDurationMinutes: selectedBreakMinutes,
                    lastModifiedTimestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                logActivity('Updated Break Duration', {
                    projectId: project.id,
                    projectName: project.baseProjectName + ' ' + project.areaTask,
                    oldValue: oldBreakMinutes,
                    newValue: selectedBreakMinutes
                });
                // Optimistically update the total duration cell
                const currentRow = event.target.closest('tr');
                if (currentRow) {
                    const totalCellInRow = currentRow.querySelector('.total-duration-column');
                    if (totalCellInRow) {
                        let currentTotalRawMs = (project.durationDay1Ms || 0) + (project.durationDay2Ms || 0) + (project.durationDay3Ms || 0);
                        let currentBreakMs = selectedBreakMinutes * 60000;
                        let currentAdditionalMs = (project.additionalMinutesManual || 0) * 60000;
                        let currentDurationAfterBreakMs = Math.max(0, currentTotalRawMs - currentBreakMs);
                        let currentFinalTotalMs = currentDurationAfterBreakMs + currentAdditionalMs;
                        if (currentTotalRawMs === 0 && selectedBreakMinutes === 0 && (project.additionalMinutesManual || 0) === 0) {
                            currentFinalTotalMs = null;
                        }
                        totalCellInRow.textContent = formatMillisToMinutes(currentFinalTotalMs);
                        project.breakDurationMinutes = selectedBreakMinutes; // Update local project object
                    }
                }
            } catch (error) {
                console.error("Error updating break duration:", error);
                alert("Error updating break duration: " + error.message);
                event.target.value = oldBreakMinutes.toString(); // Revert on error
            } finally {
                hideLoading();
            }
        };
        btnContainer.appendChild(breakSelect);

        const isOriginalReassignedTask = project.status === 'Reassigned_TechAbsent';

        // Day 1 Start Button
        const sD1btn = document.createElement('button');
        sD1btn.textContent = 'Start D1';
        sD1btn.classList.add('btn', 'btn-day-start');
        sD1btn.disabled = isOriginalReassignedTask || !(project.status === 'Available' || project.status === 'Day1Ended_AwaitingNext' || project.status === 'InProgressDay2' || project.status === 'Day2Ended_AwaitingNext' || project.status === 'InProgressDay3' || project.status === 'Completed');
        sD1btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'startDay1');
        };
        btnContainer.appendChild(sD1btn);

        // Day 1 End Button
        const eD1btn = document.createElement('button');
        eD1btn.textContent = 'End D1';
        eD1btn.classList.add('btn', 'btn-day-end');
        eD1btn.disabled = project.status !== 'InProgressDay1' || isOriginalReassignedTask;
        eD1btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'endDay1');
        };
        btnContainer.appendChild(eD1btn);

        // Day 2 Start Button
        const sD2btn = document.createElement('button');
        sD2btn.textContent = 'Start D2';
        sD2btn.classList.add('btn', 'btn-day-start');
        sD2btn.disabled = isOriginalReassignedTask || !(project.status === 'Day1Ended_AwaitingNext' || project.status === 'Day2Ended_AwaitingNext' || project.status === 'InProgressDay3' || project.status === 'Completed');
        sD2btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'startDay2');
        };
        btnContainer.appendChild(sD2btn);

        // Day 2 End Button
        const eD2btn = document.createElement('button');
        eD2btn.textContent = 'End D2';
        eD2btn.classList.add('btn', 'btn-day-end');
        eD2btn.disabled = project.status !== 'InProgressDay2' || isOriginalReassignedTask;
        eD2btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'endDay2');
        };
        btnContainer.appendChild(eD2btn);

        // Day 3 Start Button
        const sD3btn = document.createElement('button');
        sD3btn.textContent = 'Start D3';
        sD3btn.classList.add('btn', 'btn-day-start');
        sD3btn.disabled = isOriginalReassignedTask || !(project.status === 'Day2Ended_AwaitingNext' || project.status === 'InProgressDay3' || project.status === 'Completed');
        sD3btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'startDay3');
        };
        btnContainer.appendChild(sD3btn);

        // Day 3 End Button
        const eD3btn = document.createElement('button');
        eD3btn.textContent = 'End D3';
        eD3btn.classList.add('btn', 'btn-day-end');
        eD3btn.disabled = project.status !== 'InProgressDay3' || isOriginalReassignedTask;
        eD3btn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'endDay3');
        };
        btnContainer.appendChild(eD3btn);


        // Mark Done Button
        const doneBtn = document.createElement('button');
        doneBtn.textContent = 'Done';
        doneBtn.classList.add('btn', 'btn-mark-done');
        doneBtn.disabled = project.status === 'Completed' || isOriginalReassignedTask;
        doneBtn.onclick = () => {
            if (project.id) updateProjectState(project.id, 'markDone');
        };
        btnContainer.appendChild(doneBtn);

        // Re-Assign Button
        const reassignBtn = document.createElement('button');
        reassignBtn.textContent = 'Re-Assign';
        reassignBtn.classList.add('btn', 'btn-warning');
        reassignBtn.title = 'Re-assign task by creating a new entry.';
        reassignBtn.disabled = project.status === 'Completed' || isOriginalReassignedTask;
        reassignBtn.onclick = () => {
            const currentProjectData = projects.find(p => p.id === project.id);
            if (currentProjectData) handleReassignment(currentProjectData);
        };
        btnContainer.appendChild(reassignBtn);

        actionsCell.appendChild(btnContainer);
    });
}

async function updateProjectState(projectId, action) {
    showLoading("Updating project state...");
    if (!db || !projectId) {
        alert("Database not initialized or project ID missing for state update.");
        hideLoading();
        return;
    }
    const projectRef = db.collection("projects").doc(projectId);
    let currentProjectData;
    try {
        const doc = await projectRef.get();
        if (!doc.exists) {
            console.warn("Project document not found:", projectId);
            hideLoading();
            return;
        }
        currentProjectData = doc.data();
    } catch (error) {
        console.error("Error fetching current project data for update:", error);
        alert("Error fetching project data: " + error.message);
        hideLoading();
        return;
    }
    if (!currentProjectData || currentProjectData.status === 'Reassigned_TechAbsent') {
        console.warn("Attempted to update a reassigned or invalid project.");
        hideLoading();
        return;
    }

    const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const clientNowMillis = Date.now();
    let updatedFields = {
        lastModifiedTimestamp: serverTimestamp
    };
    let oldStatus = currentProjectData.status;
    let newStatus = oldStatus;

    switch (action) {
        case 'startDay1':
            // Allow starting Day 1 if not already InProgressDay1 and not Reassigned
            if (['Available', 'Day1Ended_AwaitingNext', 'InProgressDay2', 'Day2Ended_AwaitingNext', 'InProgressDay3', 'Completed'].includes(currentProjectData.status)) {
                updatedFields = {
                    ...updatedFields,
                    status: 'InProgressDay1',
                    startTimeDay1: serverTimestamp,
                    finishTimeDay1: null,
                    durationDay1Ms: null,
                    startTimeDay2: null,
                    finishTimeDay2: null,
                    durationDay2Ms: null,
                    startTimeDay3: null,
                    finishTimeDay3: null,
                    durationDay3Ms: null
                };
                newStatus = 'InProgressDay1';
            }
            break;
        case 'endDay1':
            if (currentProjectData.status === 'InProgressDay1' && currentProjectData.startTimeDay1) {
                updatedFields = {
                    ...updatedFields,
                    status: 'Day1Ended_AwaitingNext',
                    finishTimeDay1: serverTimestamp,
                    durationDay1Ms: calculateDurationMs(currentProjectData.startTimeDay1, clientNowMillis)
                };
                newStatus = 'Day1Ended_AwaitingNext';
            } else {
                alert("Cannot end Day 1. Task is not in 'In Progress Day 1' status or start time is missing.");
            }
            break;
        case 'startDay2':
            if (['Day1Ended_AwaitingNext', 'Day2Ended_AwaitingNext', 'InProgressDay3', 'Completed'].includes(currentProjectData.status)) {
                updatedFields = {
                    ...updatedFields,
                    status: 'InProgressDay2',
                    startTimeDay2: serverTimestamp,
                    finishTimeDay2: null,
                    durationDay2Ms: null,
                    startTimeDay3: null,
                    finishTimeDay3: null,
                    durationDay3Ms: null
                };
                newStatus = 'InProgressDay2';
            }
            break;
        case 'endDay2':
            if (currentProjectData.status === 'InProgressDay2' && currentProjectData.startTimeDay2) {
                updatedFields = {
                    ...updatedFields,
                    status: 'Day2Ended_AwaitingNext',
                    finishTimeDay2: serverTimestamp,
                    durationDay2Ms: calculateDurationMs(currentProjectData.startTimeDay2, clientNowMillis)
                };
                newStatus = 'Day2Ended_AwaitingNext';
            } else {
                alert("Cannot end Day 2. Task is not in 'In Progress Day 2' status or start time is missing.");
            }
            break;
        case 'startDay3':
            if (['Day2Ended_AwaitingNext', 'InProgressDay3', 'Completed'].includes(currentProjectData.status)) {
                updatedFields = {
                    ...updatedFields,
                    status: 'InProgressDay3',
                    startTimeDay3: serverTimestamp,
                    finishTimeDay3: null,
                    durationDay3Ms: null
                };
                newStatus = 'InProgressDay3';
            }
            break;
        case 'endDay3':
            if (currentProjectData.status === 'InProgressDay3' && currentProjectData.startTimeDay3) {
                updatedFields = {
                    ...updatedFields,
                    status: 'Completed',
                    finishTimeDay3: serverTimestamp,
                    durationDay3Ms: calculateDurationMs(currentProjectData.startTimeDay3, clientNowMillis)
                };
                newStatus = 'Completed';
            } else {
                alert("Cannot end Day 3. Task is not in 'In Progress Day 3' status or start time is missing.");
            }
            break;
        case 'markDone':
            if (currentProjectData.status !== 'Completed') {
                updatedFields.status = 'Completed';
                newStatus = 'Completed';
                // Ensure all active day times are recorded if marked done
                if (currentProjectData.startTimeDay1 && !currentProjectData.finishTimeDay1) {
                    updatedFields.finishTimeDay1 = serverTimestamp;
                    updatedFields.durationDay1Ms = calculateDurationMs(currentProjectData.startTimeDay1, clientNowMillis);
                }
                if (currentProjectData.startTimeDay2 && !currentProjectData.finishTimeDay2) {
                    updatedFields.finishTimeDay2 = serverTimestamp;
                    updatedFields.durationDay2Ms = calculateDurationMs(currentProjectData.startTimeDay2, clientNowMillis);
                }
                if (currentProjectData.startTimeDay3 && !currentProjectData.finishTimeDay3) {
                    updatedFields.finishTimeDay3 = serverTimestamp;
                    updatedFields.durationDay3Ms = calculateDurationMs(currentProjectData.startTimeDay3, clientNowMillis);
                }

                // Additional logic to clear future days if not started or ended
                if (currentProjectData.status === 'Available') {
                    // No times recorded yet, simply mark completed
                    updatedFields.startTimeDay1 = null; updatedFields.finishTimeDay1 = null; updatedFields.durationDay1Ms = null;
                    updatedFields.startTimeDay2 = null; updatedFields.finishTimeDay2 = null; updatedFields.durationDay2Ms = null;
                    updatedFields.startTimeDay3 = null; updatedFields.finishTimeDay3 = null; updatedFields.durationDay3Ms = null;
                } else if (!currentProjectData.startTimeDay2 && currentProjectData.startTimeDay1 && !currentProjectData.finishTimeDay1) {
                    // Day 1 started, but not finished, and Day 2 not started. Finish Day 1.
                    updatedFields.finishTimeDay1 = serverTimestamp;
                    updatedFields.durationDay1Ms = calculateDurationMs(currentProjectData.startTimeDay1, clientNowMillis);
                    updatedFields.startTimeDay2 = null;
                    updatedFields.finishTimeDay2 = null;
                    updatedFields.durationDay2Ms = null;
                    updatedFields.startTimeDay3 = null;
                    updatedFields.finishTimeDay3 = null;
                    updatedFields.durationDay3Ms = null;
                } else if (currentProjectData.startTimeDay1 && currentProjectData.finishTimeDay1 && !currentProjectData.startTimeDay2) {
                    // Day 1 completed, Day 2 not started. Clear Day 2/3.
                    updatedFields.startTimeDay2 = null;
                    updatedFields.finishTimeDay2 = null;
                    updatedFields.durationDay2Ms = null;
                    updatedFields.startTimeDay3 = null;
                    updatedFields.finishTimeDay3 = null;
                    updatedFields.durationDay3Ms = null;
                } else if (currentProjectData.startTimeDay2 && !currentProjectData.finishTimeDay2) {
                    // Day 2 started, not finished. Finish Day 2. Clear Day 3.
                    updatedFields.finishTimeDay2 = serverTimestamp;
                    updatedFields.durationDay2Ms = calculateDurationMs(currentProjectData.startTimeDay2, clientNowMillis);
                    updatedFields.startTimeDay3 = null;
                    updatedFields.finishTimeDay3 = null;
                    updatedFields.durationDay3Ms = null;
                } else if (currentProjectData.startTimeDay2 && currentProjectData.finishTimeDay2 && !currentProjectData.startTimeDay3) {
                    // Day 2 completed, Day 3 not started. Clear Day 3.
                    updatedFields.startTimeDay3 = null;
                    updatedFields.finishTimeDay3 = null;
                    updatedFields.durationDay3Ms = null;
                }
            }
            break;
        default:
            hideLoading();
            return;
    }
    if (Object.keys(updatedFields).length > 1) { // Check if any actual fields were updated beyond just timestamp
        try {
            await projectRef.update(updatedFields);
            logActivity(`Updated Project Status: ${action}`, {
                projectId: projectId,
                projectName: currentProjectData.baseProjectName + ' ' + currentProjectData.areaTask,
                oldStatus: oldStatus,
                newStatus: newStatus
            });
        } catch (error) {
            console.error(`Error updating project ${projectId}:`, error);
            alert("Error updating project status: " + error.message);
        } finally {
            hideLoading();
        }
    } else {
        hideLoading();
    }
}

async function handleReassignment(originalProjectData) {
    if (!originalProjectData || !originalProjectData.id || originalProjectData.status === 'Reassigned_TechAbsent' || originalProjectData.status === 'Completed') {
        alert("Cannot re-assign. Task is already reassigned, completed, or invalid.");
        return;
    }
    const newTechId = prompt(`Task for '${originalProjectData.areaTask}'. Enter New Tech ID:`);
    if (newTechId === null || newTechId.trim() === "") {
        alert("Reassignment cancelled. Tech ID cannot be empty.");
        return;
    }

    if (confirm(`Create NEW task for '${newTechId.trim()}'? Current task will be closed and marked as 'Re-assigned'.`)) {
        showLoading("Reassigning task...");
        if (!db) {
            alert("Database not initialized! Cannot re-assign.");
            hideLoading();
            return;
        }
        const batch = db.batch();
        const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        const newReassignedData = {
            batchId: originalProjectData.batchId,
            baseProjectName: originalProjectData.baseProjectName,
            areaTask: originalProjectData.areaTask,
            gsd: originalProjectData.gsd,
            fixCategory: originalProjectData.fixCategory,
            assignedTo: newTechId.trim(),
            status: 'Available', // New task starts as available
            startTimeDay1: null,
            finishTimeDay1: null,
            durationDay1Ms: null,
            startTimeDay2: null,
            finishTimeDay2: null,
            durationDay2Ms: null,
            startTimeDay3: null,
            finishTimeDay3: null,
            durationDay3Ms: null,
            techNotes: `Reassigned from ${originalProjectData.assignedTo || 'N/A'}. Original Project ID: ${originalProjectData.id}`,
            creationTimestamp: serverTimestamp,
            lastModifiedTimestamp: serverTimestamp,
            isReassigned: true, // Mark the new task as reassigned
            originalProjectId: originalProjectData.id, // Link to the original task
            releasedToNextStage: false,
            breakDurationMinutes: 0,
            additionalMinutesManual: 0
        };
        const newDocRef = db.collection("projects").doc();
        batch.set(newDocRef, newReassignedData);
        // Update the original task to 'Reassigned_TechAbsent'
        batch.update(db.collection("projects").doc(originalProjectData.id), {
            status: 'Reassigned_TechAbsent',
            lastModifiedTimestamp: serverTimestamp
        });
        try {
            await batch.commit();
            logActivity('Reassigned Task', {
                originalProjectId: originalProjectData.id,
                originalProjectName: originalProjectData.baseProjectName + ' ' + originalProjectData.areaTask,
                oldAssignedTo: originalProjectData.assignedTo,
                newAssignedTo: newTechId.trim(),
                newProjectId: newDocRef.id
            });
            initializeFirebaseAndLoadData(); // Re-load data to show changes
        } catch (error) {
            console.error("Error in re-assignment:", error);
            alert("Error during re-assignment: " + error.message);
        } finally {
            hideLoading();
        }
    }
}

function refreshAllViews() {
    try {
        renderProjects();
    } catch (e) {
        console.error("Error during refreshAllViews:", e);
        alert("An error occurred while refreshing the project display. Please check the console.");
    }
}

async function renderAllowedEmailsList() {
    if (!allowedEmailsList) {
        console.error("allowedEmailsList element not found.");
        return;
    }
    showLoading("Rendering allowed emails..."); // Indicate loading for this specific action
    await fetchAllowedEmails(); // Ensure we have the latest list
    allowedEmailsList.innerHTML = '';
    if (allowedEmailsFromFirestore.length === 0) {
        allowedEmailsList.innerHTML = '<li>No allowed emails configured. Please add at least one.</li>';
        hideLoading();
        return;
    }
    allowedEmailsFromFirestore.forEach(email => {
        const li = document.createElement('li');
        li.textContent = email;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.classList.add('btn', 'btn-danger', 'btn-small'); // Add some styling
        removeBtn.onclick = () => handleRemoveEmail(email);
        li.appendChild(removeBtn);
        allowedEmailsList.appendChild(li);
    });
    hideLoading(); // Hide loading after rendering
}

async function handleAddEmail() {
    showLoading("Adding email...");
    if (!addEmailInput) {
        hideLoading();
        return;
    }
    const newEmail = addEmailInput.value.trim().toLowerCase();
    if (!newEmail || !newEmail.includes('@') || !newEmail.includes('.')) { // Basic email format check
        alert("Please enter a valid email address (e.g., user@example.com).");
        hideLoading();
        return;
    }
    if (allowedEmailsFromFirestore.map(e => e.toLowerCase()).includes(newEmail)) {
        alert("This email is already in the allowed list.");
        hideLoading();
        return;
    }
    const updatedEmails = [...allowedEmailsFromFirestore, newEmail].sort();
    if (await updateAllowedEmailsInFirestore(updatedEmails)) {
        logActivity('Added Allowed Email', {
            email: newEmail
        });
        addEmailInput.value = ''; // Clear input
        renderAllowedEmailsList(); // Re-render the list
    }
    // hideLoading() is called by updateAllowedEmailsInFirestore
}

async function handleRemoveEmail(emailToRemove) {
    if (confirm(`Are you sure you want to remove ${emailToRemove} from the allowed list? This will prevent them from logging in.`)) {
        showLoading("Removing email...");
        const updatedEmails = allowedEmailsFromFirestore.filter(email => email !== emailToRemove);
        if (await updateAllowedEmailsInFirestore(updatedEmails)) {
            logActivity('Removed Allowed Email', {
                email: emailToRemove
            });
            renderAllowedEmailsList(); // Re-render the list
        }
        // hideLoading() is called by updateAllowedEmailsInFirestore
    }
}

async function generateTlSummaryData() {
    if (!tlSummaryContent) {
        console.error("tlSummaryContent element not found.");
        return;
    }
    showLoading("Generating TL Summary...");
    tlSummaryContent.innerHTML = '<p>Loading summary...</p>';

    if (!db) {
        tlSummaryContent.innerHTML = '<p style="color:red;">Database not initialized. Cannot generate summary.</p>';
        hideLoading();
        return;
    }

    try {
        const allProjectsSnapshot = await db.collection("projects").get();
        const allProjects = [];
        allProjectsSnapshot.forEach(doc => {
            if (doc.exists && typeof doc.data === 'function') {
                allProjects.push({
                    id: doc.id,
                    ...doc.data()
                });
            }
        });

        const projectFixTotals = {};

        allProjects.forEach(p => {
            // Ensure fields exist and are numbers, default to 0 if not
            p.durationDay1Ms = typeof p.durationDay1Ms === 'number' ? p.durationDay1Ms : 0;
            p.durationDay2Ms = typeof p.durationDay2Ms === 'number' ? p.durationDay2Ms : 0;
            p.durationDay3Ms = typeof p.durationDay3Ms === 'number' ? p.durationDay3Ms : 0;
            p.breakDurationMinutes = typeof p.breakDurationMinutes === 'number' ? p.breakDurationMinutes : 0;
            p.additionalMinutesManual = typeof p.additionalMinutesManual === 'number' ? p.additionalMinutesManual : 0;

            const totalRawDurationMs = p.durationDay1Ms + p.durationDay2Ms + p.durationDay3Ms;
            const breakToSubtractMs = p.breakDurationMinutes * 60000;
            const additionalManualMs = p.additionalMinutesManual * 60000;

            let finalTotalDurationMs = Math.max(0, totalRawDurationMs - breakToSubtractMs) + additionalManualMs;

            // Only include projects with actual work recorded or specific non-zero adjustments
            if (finalTotalDurationMs === 0 && p.breakDurationMinutes === 0 && p.additionalMinutesManual === 0 && totalRawDurationMs === 0) {
                return;
            }

            const key = `${p.baseProjectName || 'Unknown Project'}_${p.fixCategory || 'Unknown Fix'}`;
            if (!projectFixTotals[key]) {
                projectFixTotals[key] = {
                    projectName: p.baseProjectName || 'Unknown Project',
                    fixCategory: p.fixCategory || 'Unknown Fix',
                    totalMinutes: 0
                };
            }
            projectFixTotals[key].totalMinutes += Math.floor(finalTotalDurationMs / 60000);
        });

        let summaryHtml = '<ul style="list-style: none; padding: 0;">';
        // Sort keys for consistent display
        const sortedKeys = Object.keys(projectFixTotals).sort();

        sortedKeys.forEach(key => {
            const data = projectFixTotals[key];
            const decimalHours = (data.totalMinutes / 60).toFixed(2);
            summaryHtml += `
                <li style="margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px dotted #eee;">
                    <strong>Project Name:</strong> ${data.projectName} (${data.fixCategory})<br>
                    <strong>Total:</strong> ${data.totalMinutes} minutes<br>
                    <strong>Decimal:</strong> ${decimalHours} hours
                </li>
            `;
        });

        if (sortedKeys.length === 0) {
            summaryHtml = '<p>No project time data found to generate a summary.</p>';
        } else {
            summaryHtml += '</ul>';
        }

        tlSummaryContent.innerHTML = summaryHtml;
        logActivity('Generated TL Summary', {
            numEntries: sortedKeys.length
        });

    } catch (error) {
        console.error("Error generating TL Summary:", error);
        tlSummaryContent.innerHTML = '<p style="color:red;">Error generating summary: ' + error.message + '</p>';
        alert("Error generating TL Summary: " + error.message);
    } finally {
        hideLoading();
    }
}


function setupAuthEventListeners() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email'); // Request email scope explicitly

    if (signInBtn) {
        signInBtn.addEventListener('click', () => {
            showLoading("Signing in...");
            if (!auth) {
                console.error("Auth not initialized");
                hideLoading();
                return;
            }
            auth.signInWithPopup(provider)
                .then((result) => {
                    console.log("Sign-in attempt successful for: ", result.user.email);
                    // Auth state change listener will handle UI update
                })
                .catch((error) => {
                    console.error("Sign-in error: ", error);
                    let errorMessage = "Error signing in: " + error.message;
                    if (error.code === 'auth/popup-closed-by-user') {
                        errorMessage = "Sign-in process was cancelled. Please try again.";
                    } else if (error.code === 'auth/cancelled-popup-request') {
                        errorMessage = "Sign-in process was interrupted. Please try again.";
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMessage = "Sign-in pop-up was blocked by the browser. Please allow pop-ups for this site and try again.";
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMessage = "Network error. Please check your internet connection.";
                    }
                    alert(errorMessage);
                    // Ensure UI reverts to signed-out state if sign-in fails
                    if (loadingAuthMessageDiv && signInBtn && userInfoDisplayDiv && appContentDiv) {
                        userInfoDisplayDiv.style.display = 'none';
                        signInBtn.style.display = 'block';
                        appContentDiv.style.display = 'none';
                        loadingAuthMessageDiv.innerHTML = '<p>Please sign in to access the Project Tracker.</p>';
                        loadingAuthMessageDiv.style.display = 'block';
                    }
                    hideLoading();
                });
        });
    } else {
        console.error("Sign-in button not found during event listener setup.");
    }

    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            showLoading("Signing out...");
            if (!auth) {
                console.error("Auth not initialized");
                hideLoading();
                return;
            }
            auth.signOut()
                .then(() => {
                    console.log("User signed out successfully by clicking button.");
                    // Auth state change listener will handle UI update
                })
                .catch((error) => {
                    console.error("Sign-out error: ", error);
                    alert("Error signing out: " + error.message);
                    hideLoading();
                });
        });
    } else {
        console.error("Sign-out button not found during event listener setup.");
    }
}

function initializeAppComponents() {
    if (!isAppInitialized) {
        console.log("Initializing app components (DOM refs, event listeners, Firestore data)...");
        setupDOMReferences();
        attachEventListeners();
        initializeFirebaseAndLoadData();
        isAppInitialized = true;
    } else {
        console.log("App components already initialized or re-initializing data load.");
        initializeFirebaseAndLoadData(); // Ensures data reloads if component already initialized
    }
}

// Centralized Auth State Change Listener
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        // Ensure DOM references are setup before attempting to modify UI elements
        setupDOMReferences();
        setupAuthRelatedDOMReferences();

        if (!userNameP || !userEmailP || !userPhotoImg || !userInfoDisplayDiv || !signInBtn || !appContentDiv || !loadingAuthMessageDiv || !openSettingsBtn) {
            console.error("One or more critical UI elements for auth state change not found. Aborting UI update.");
            hideLoading();
            return;
        }

        if (user) {
            showLoading("Checking authorization...");
            await fetchAllowedEmails(); // Fetch the latest allowed emails for authorization check
            const userEmailLower = user.email ? user.email.toLowerCase() : "";

            if (user.email && allowedEmailsFromFirestore.map(email => email.toLowerCase()).includes(userEmailLower)) {
                console.log("Auth state changed: User is SIGNED IN and ALLOWED - ", user.displayName, user.email);

                userNameP.textContent = user.displayName || "Name not available";
                userEmailP.textContent = user.email || "Email not available";
                userPhotoImg.src = user.photoURL || "default-user.png";

                userInfoDisplayDiv.style.display = 'flex';
                signInBtn.style.display = 'none';
                loadingAuthMessageDiv.style.display = 'none';
                appContentDiv.style.display = 'block';
                openSettingsBtn.style.display = 'block'; // Show settings button only for authenticated users

                initializeAppComponents(); // Initialize/re-initialize app data
            } else {
                console.warn("Auth state changed: User SIGNED IN but NOT ALLOWED - ", user.email);
                alert("Access Denied: Your email address (" + (user.email || "N/A") + ") is not authorized to use this application. You will be signed out.");

                auth.signOut().then(() => {
                    console.log("Unauthorized user automatically signed out.");
                    loadingAuthMessageDiv.innerHTML = '<p>Access Denied. Please sign in with an authorized account.</p>';
                    userInfoDisplayDiv.style.display = 'none';
                    signInBtn.style.display = 'block';
                    appContentDiv.style.display = 'none';
                    loadingAuthMessageDiv.style.display = 'block';
                    openSettingsBtn.style.display = 'none'; // Hide settings button

                    // Clear any displayed project data for unauthorized user
                    projects = [];
                    if (projectTableBody) projectTableBody.innerHTML = '';
                    if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = '';
                    if (allowedEmailsList) allowedEmailsList.innerHTML = '';
                    // Detach Firestore listener if active
                    if (firestoreListenerUnsubscribe) {
                        firestoreListenerUnsubscribe();
                        firestoreListenerUnsubscribe = null;
                        console.log("Firestore listener detached for unauthorized user sign out.");
                    }
                    isAppInitialized = false; // Reset app initialization state
                    hideLoading();
                }).catch(error => {
                    console.error("Error signing out unauthorized user:", error);
                    alert("Error signing out unauthorized user: " + error.message);
                    // Ensure UI reflects signed out state even if sign-out fails
                    userInfoDisplayDiv.style.display = 'none';
                    signInBtn.style.display = 'block';
                    appContentDiv.style.display = 'none';
                    loadingAuthMessageDiv.innerHTML = '<p>Access Denied. Error during sign out. Please refresh.</p>';
                    loadingAuthMessageDiv.style.display = 'block';
                    openSettingsBtn.style.display = 'none';
                    hideLoading();
                });
            }

        } else {
            console.log("Auth state changed: User is SIGNED OUT");

            // Clear user info display
            userNameP.textContent = '';
            userEmailP.textContent = '';
            userPhotoImg.src = '';

            // Show sign-in button, hide app content
            userInfoDisplayDiv.style.display = 'none';
            signInBtn.style.display = 'block';
            appContentDiv.style.display = 'none';
            openSettingsBtn.style.display = 'none'; // Hide settings button

            // Display appropriate message
            if (loadingAuthMessageDiv.innerHTML.indexOf("Access Denied") === -1) {
                loadingAuthMessageDiv.innerHTML = '<p>Please sign in to access the Project Tracker.</p>';
            }
            loadingAuthMessageDiv.style.display = 'block';

            // Clear project data and detach listener for signed out state
            projects = [];
            if (projectTableBody) projectTableBody.innerHTML = '';
            if (tlDashboardContentElement) tlDashboardContentElement.innerHTML = '';
            if (allowedEmailsList) allowedEmailsList.innerHTML = '';
            if (firestoreListenerUnsubscribe) {
                firestoreListenerUnsubscribe();
                firestoreListenerUnsubscribe = null;
                console.log("Firestore listener detached on sign out.");
            }
            isAppInitialized = false; // Reset app initialization state
            console.log("App content hidden, project data cleared, and Firestore listener detached.");
            hideLoading();
        }
    });
} else {
    console.error("Firebase Auth is not initialized. UI updates based on auth state will not occur.");
    if (loadingAuthMessageDiv) {
        loadingAuthMessageDiv.innerHTML = `<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>`;
        loadingAuthMessageDiv.style.display = 'block';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded.");
    setupDOMReferences();
    setupAuthRelatedDOMReferences();

    // Only set up auth listeners if Firebase Auth is available
    if (auth) {
        setupAuthEventListeners();
        console.log("Auth UI and event listeners set up.");
    } else {
        console.error("Firebase Auth not available on DOMContentLoaded. Auth UI setup skipped.");
        const authContainer = document.getElementById('auth-container'); // Assuming you have an auth-container
        if (authContainer && loadingAuthMessageDiv) {
            loadingAuthMessageDiv.innerHTML = '<p style="color:red; font-weight:bold;">Authentication services could not be loaded. Please check the console and refresh.</p>';
            loadingAuthMessageDiv.style.display = 'block';
        }
    }
});
