class ClaimWebApp {
    constructor() {
        this.mondayClient = new MondayClient();
        this.currentWeekStart = this.getMonday(new Date());
        this.user = null;
        this.entries = new Map();
        this.currentEditingDate = null;
        this.responsivenessCheck = null;

        this.logger = window.diagnosticLogger;
        this.initializeApp();
    }

    initializeApp() {
        this.logger.log('🚀 Initializing ClaimWebApp...');
        this.updateStatus('Initializing');

        try {
            this.bindEvents();
            this.loadStoredApiKey();
            this.renderCalendarView();
            this.startResponsivenessCheck();
            this.logger.log('✅ App initialized successfully');
            this.updateStatus('Ready');
        } catch (error) {
            this.logger.log(`❌ App initialization failed: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        }
    }

    bindEvents() {
        this.logger.log('Binding events...');

        // API Key
        document.getElementById('saveApiKey').addEventListener('click', () => this.saveApiKey());
        document.getElementById('apiKey').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveApiKey();
        });

        // Date Navigation
        document.getElementById('prevWeek').addEventListener('click', () => this.previousWeek());
        document.getElementById('nextWeek').addEventListener('click', () => this.nextWeek());
        document.getElementById('weekPicker').addEventListener('change', (e) => this.selectWeek(e.target.value));
        document.getElementById('queryData').addEventListener('click', () => this.loadData());

        // Debug Controls
        document.getElementById('toggleDebug').addEventListener('click', () => this.toggleDebug());
        document.getElementById('forceLoad').addEventListener('click', () => this.forceLoad());
        document.getElementById('testConnection').addEventListener('click', () => this.testConnection());

        // Modal Events
        document.querySelector('.close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('cancelEntry').addEventListener('click', () => this.closeModal());
        document.getElementById('saveEntry').addEventListener('click', () => this.saveEntry());
        document.getElementById('addAnother').addEventListener('click', () => this.saveEntry(true));

        // Bulk Actions
        document.getElementById('addMultipleEntries').addEventListener('click', () => this.openMultiEntryModal());
        document.getElementById('clearAll').addEventListener('click', () => this.clearAllEntries());

        // Activity type selection
        document.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-value');
                document.getElementById('activityType').value = value;
            });
        });

        // Close modal when clicking outside
        document.getElementById('entryModal').addEventListener('click', (e) => {
            if (e.target.id === 'entryModal') {
                this.closeModal();
            }
        });

        this.logger.log('✅ All events bound successfully');
    }

    updateStatus(status, type = 'ready') {
        const statusElement = document.getElementById('appStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.className = `status-indicator ${type}`;
        }
    }

    startResponsivenessCheck() {
        this.logger.log('Starting responsiveness check...');
        this.responsivenessCheck = this.logger.startResponsivenessCheck();
    }

    async testConnection() {
        this.logger.log('Testing Monday.com connection...');
        this.updateStatus('Testing Connection', 'loading');

        try {
            const result = await this.mondayClient.testConnection();
            if (result.success) {
                this.logger.log('✅ Connection test successful');
                this.showNotification('Connection test successful!', 'success');
                this.updateStatus('Ready');
            } else {
                this.logger.log(`❌ Connection test failed: ${result.error}`, 'error');
                this.showNotification(`Connection failed: ${result.error}`, 'error');
                this.updateStatus('Connection Failed', 'error');
            }
        } catch (error) {
            this.logger.log(`❌ Connection test error: ${error.message}`, 'error');
            this.showNotification(`Connection error: ${error.message}`, 'error');
            this.updateStatus('Connection Error', 'error');
        }
    }

    toggleDebug() {
        this.logger.toggleLogger();
    }

    forceLoad() {
        this.logger.log('Force loading data...');
        this.loadData();
    }

    // Date and calendar methods
    getMonday(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    getWeekDates(startDate) {
        const dates = [];
        for (let i = 0; i < 5; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            dates.push(date);
        }
        return dates;
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    formatDisplayDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatShortDate(date) {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    renderCalendarView() {
        this.logger.log('Rendering calendar view...');
        const calendarGrid = document.getElementById('calendarGrid');
        if (!calendarGrid) {
            this.logger.log('❌ Calendar grid element not found', 'error');
            return;
        }

        const weekDates = this.getWeekDates(this.currentWeekStart);

        document.getElementById('weekPicker').value = this.formatDate(this.currentWeekStart);
        document.getElementById('weekRange').textContent =
            `${this.formatShortDate(weekDates[0])} - ${this.formatShortDate(weekDates[4])}`;

        let html = '';

        weekDates.forEach(date => {
            const dateStr = this.formatDate(date);
            const dayEntries = this.entries.get(dateStr) || [];
            const dayTotalHours = dayEntries.reduce((sum, entry) => sum + parseFloat(entry.hours || 0), 0);

            this.logger.log(`Rendering date ${dateStr}: ${dayEntries.length} entries`);

            html += `
                <div class="calendar-day" data-date="${dateStr}">
                    <div class="calendar-day-header">
                        <div>
                            <div class="day-name">${date.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                            <div class="day-date">${this.formatDisplayDate(date)}</div>
                        </div>
                        <div class="day-total">${dayTotalHours.toFixed(1)}h</div>
                    </div>

                    <div class="entries-list">
                        ${dayEntries.length > 0 ?
                    dayEntries.map(entry => this.renderEntryItem(entry)).join('') :
                    `<div class="empty-state">
                                <i class="fas fa-calendar-plus"></i>
                                <div>No entries yet</div>
                                <div style="font-size: 10px; margin-top: 5px; color: #999;">
                                    Click "Add Entry" to create one
                                </div>
                            </div>`
                }
                    </div>

                    <button class="add-entry-btn" data-date="${dateStr}">
                        <i class="fas fa-plus"></i> Add Entry
                    </button>
                </div>
            `;
        });

        calendarGrid.innerHTML = html;

        document.querySelectorAll('.add-entry-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const date = e.target.getAttribute('data-date');
                this.openEntryModal(date);
            });
        });

        this.updateWeekSummary();
        this.logger.log('✅ Calendar view rendered');
    }

    renderEntryItem(entry) {
        const activityClass = this.getActivityTypeName(entry.activityType).toLowerCase().replace(/ /g, '_');
        const displayCustomer = entry.customer && entry.customer !== 'null' ? entry.customer : 'No customer';
        const displayWorkItem = entry.workItem && entry.workItem !== 'null' ? entry.workItem : 'No work item';
        const displayComment = entry.comment && entry.comment !== 'null' ? entry.comment : '';

        return `
            <div class="entry-item ${activityClass}">
                <div class="entry-header">
                    <div class="entry-customer" title="${displayCustomer}">${this.truncateText(displayCustomer, 20)}</div>
                    <div class="entry-hours">${entry.hours}h</div>
                </div>
                <div class="entry-details">
                    <span class="entry-activity">${this.getActivityTypeName(entry.activityType)}</span>
                    <span title="${displayWorkItem}">${this.truncateText(displayWorkItem, 25)}</span>
                    ${displayComment ? `<br><small title="${displayComment}">${this.truncateText(displayComment, 30)}</small>` : ''}
                </div>
            </div>
        `;
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    getActivityTypeName(value) {
        const types = {
            0: 'Vacation', 1: 'Billable', 2: 'Holding', 3: 'Education',
            4: 'Work Reduction', 5: 'TBD', 6: 'Holiday', 7: 'Presales',
            8: 'Illness', 9: 'Paid Not Worked', 10: 'Intellectual Capital',
            11: 'Business Development', 12: 'Overhead'
        };
        return types[value] || 'Unknown';
    }

    updateWeekSummary() {
        let totalHours = 0;
        let totalEntries = 0;

        this.entries.forEach((dayEntries) => {
            totalEntries += dayEntries.length;
            dayEntries.forEach(entry => {
                totalHours += parseFloat(entry.hours) || 0;
            });
        });

        document.getElementById('weekTotalHours').textContent = totalHours.toFixed(1);
        document.getElementById('weekTotalEntries').textContent = totalEntries;
    }

    openEntryModal(date) {
        this.currentEditingDate = date;
        const modal = document.getElementById('entryModal');
        const modalDate = document.getElementById('modalDate');

        modalDate.textContent = this.formatDisplayDate(new Date(date));
        modal.style.display = 'block';

        document.getElementById('entryForm').reset();
        document.getElementById('activityType').value = '1';
        document.getElementById('hours').value = '8';
    }

    closeModal() {
        document.getElementById('entryModal').style.display = 'none';
        this.currentEditingDate = null;
    }

    async saveEntry(addAnother = false) {
        const form = document.getElementById('entryForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const entry = {
            date: this.currentEditingDate,
            activityType: document.getElementById('activityType').value,
            customer: document.getElementById('customer').value.trim(),
            workItem: document.getElementById('workItem').value.trim(),
            comment: document.getElementById('comment').value.trim(),
            hours: document.getElementById('hours').value
        };

        if (!this.user) {
            this.showNotification('Please save your API key first', 'warning');
            return;
        }

        this.showLoading('Saving entry...');

        try {
            const currentYear = new Date().getFullYear().toString();
            const board = await this.mondayClient.getBoardWithGroups('6500270039');
            const groupId = this.getYearGroupId(board, currentYear) || 'new_group_mkkbbd2q';

            const columnValues = {
                person: {
                    personsAndTeams: [{ id: this.user.id, kind: "person" }]
                },
                date4: { date: entry.date },
                status: { index: parseInt(entry.activityType) },
                text__1: entry.customer,
                text8__1: entry.workItem,
                numbers__1: entry.hours.toString()
            };

            if (entry.comment) {
                columnValues.text2__1 = entry.comment;
            }

            await this.mondayClient.createItem(
                '6500270039',
                groupId,
                this.user.name,
                JSON.stringify(columnValues)
            );

            this.showNotification('Entry saved successfully!', 'success');

            if (addAnother) {
                document.getElementById('customer').value = '';
                document.getElementById('workItem').value = '';
                document.getElementById('comment').value = '';
                document.getElementById('hours').value = '8';
                document.getElementById('customer').focus();
            } else {
                this.closeModal();
                await this.loadData();
            }
        } catch (error) {
            this.showNotification(`Failed to save entry: ${error.message}`, 'error');
            this.logger.log(`Save entry failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    openMultiEntryModal() {
        const weekDates = this.getWeekDates(this.currentWeekStart);
        if (weekDates.length > 0) {
            this.openEntryModal(this.formatDate(weekDates[0]));
        }
    }

    clearAllEntries() {
        if (confirm('Are you sure you want to clear all unsaved entries from the form?')) {
            document.getElementById('entryForm').reset();
            this.showNotification('Form cleared', 'success');
        }
    }

    async saveApiKey() {
        const apiKey = document.getElementById('apiKey').value.trim();
        if (!apiKey) {
            this.showNotification('Please enter an API key', 'error');
            return;
        }

        this.showLoading('Validating API key...');

        try {
            this.mondayClient.setApiKey(apiKey);
            this.user = await this.mondayClient.getCurrentUser();

            localStorage.setItem('mondayApiKey', apiKey);
            this.showNotification('API key saved and validated successfully!', 'success');

            document.getElementById('userInfo').style.display = 'block';
            document.getElementById('userName').textContent = `User: ${this.user.name}`;
            document.getElementById('userEmail').textContent = `Email: ${this.user.email}`;
            document.getElementById('currentYear').textContent = `Year: ${new Date().getFullYear()}`;

            await this.loadData();
        } catch (error) {
            this.showNotification(`Failed to validate API key: ${error.message}`, 'error');
            this.logger.log(`API Key validation failed: ${error.message}`, 'error');
        } finally {
            this.hideLoading();
        }
    }

    loadStoredApiKey() {
        const storedKey = localStorage.getItem('mondayApiKey');
        if (storedKey) {
            document.getElementById('apiKey').value = storedKey;
            setTimeout(() => this.saveApiKey(), 1000);
        }
    }

    async loadData() {
        if (!this.user) {
            this.logger.log('No user found - cannot load data', 'warn');
            this.showNotification('Please save your API key first', 'warning');
            return;
        }

        const loadTimer = this.logger.startTimer('loadData');
        this.updateStatus('Loading Data', 'loading');
        this.showLoading('Loading entries...', 'Fetching data from Monday.com...');

        try {
            const currentYear = new Date().getFullYear().toString();
            this.logger.log(`Loading data for year: ${currentYear}`);
            this.logger.log(`Current user: ${this.user.name} (ID: ${this.user.id})`);
            this.updateLoadingDetails('Getting board information...');

            const board = await this.mondayClient.getBoardWithGroups('6500270039');
            this.logger.log('Board data received');
            this.logger.log(`Board groups: ${board.groups?.map(g => `${g.title} (${g.id})`).join(', ')}`);
            this.updateLoadingDetails('Processing board data...');

            if (!board || !board.groups) {
                this.logger.log('No board data found', 'error');
                this.showNotification('No board data found', 'error');
                this.updateStatus('Error', 'error');
                return;
            }

            const groupId = this.getYearGroupId(board, currentYear);
            this.logger.log(`Found group ID: ${groupId}`);
            this.updateLoadingDetails(`Using group: ${groupId}`);

            if (!groupId) {
                this.logger.log(`Could not find group for year ${currentYear}`, 'warn');
                this.showNotification(`Could not find group for year ${currentYear}`, 'warning');
                this.updateStatus('Ready');
                return;
            }

            let items = [];
            this.updateLoadingDetails('Querying items...');

            const queryMethods = [
                { name: 'simple', method: () => this.mondayClient.getItemsSimple('6500270039', groupId, 200) },
                { name: 'paginated', method: () => this.mondayClient.queryAllItemsInGroup('6500270039', groupId, 200) },
                { name: 'basic', method: () => this.mondayClient.getItemsBasic('6500270039', groupId) }
            ];

            for (const method of queryMethods) {
                try {
                    this.updateLoadingDetails(`Trying ${method.name} query...`);
                    this.logger.log(`Trying ${method.name} query...`);
                    items = await method.method();
                    this.logger.log(`✅ ${method.name} query successful: ${items.length} items`);
                    break;
                } catch (error) {
                    this.logger.log(`❌ ${method.name} query failed: ${error.message}`, 'warn');
                }
            }

            this.updateLoadingDetails(`Processing ${items.length} items...`);
            this.logger.log(`Total items to process: ${items.length}`);

            this.processItems(items);
            this.logger.log(`Processing complete - ${this.entries.size} dates have entries`);

            this.updateLoadingDetails('Rendering calendar...');
            this.renderCalendarView();

            const duration = this.logger.endTimer(loadTimer);
            this.logger.log(`✅ Data load completed in ${duration.toFixed(0)}ms`);
            this.showNotification(`Loaded ${items.length} entries successfully`, 'success');
            this.updateStatus('Ready');

        } catch (error) {
            this.logger.log(`❌ Data loading failed: ${error.message}`, 'error');
            this.showNotification(`Failed to load data: ${error.message}`, 'error');
            this.updateStatus('Error', 'error');
        } finally {
            this.hideLoading();
        }
    }

    updateLoadingDetails(details) {
        const detailsElement = document.getElementById('loadingDetails');
        if (detailsElement) {
            detailsElement.textContent = details;
        }
        this.logger.log(`Loading: ${details}`, 'debug');
    }

    getYearGroupId(board, year) {
        if (!board || !board.groups) {
            this.logger.log('No groups found in board', 'warn');
            return null;
        }

        let group = board.groups.find(g => g.title === year);
        if (group) return group.id;

        const currentYear = new Date().getFullYear().toString();
        group = board.groups.find(g => g.title === currentYear);
        if (group) return group.id;

        group = board.groups.find(g => g.title.includes(year));
        if (group) return group.id;

        if (board.groups.length > 0) {
            this.logger.log(`Using first group as fallback: ${board.groups[0].title}`);
            return board.groups[0].id;
        }

        return null;
    }

    processItems(items) {
        const processTimer = this.logger.startTimer('processItems');
        this.entries.clear();
        this.logger.log(`Processing ${items.length} items...`);

        let userMatchCount = 0;
        let dateExtractedCount = 0;
        let currentWeekEntries = 0;

        // Get current week dates for filtering
        const currentWeekDates = this.getWeekDates(this.currentWeekStart).map(date => this.formatDate(date));
        this.logger.log(`Current week dates: ${currentWeekDates.join(', ')}`);

        items.forEach((item, index) => {
            const isUserItem = this.isUserItem(item);
            if (isUserItem) {
                userMatchCount++;
                const date = this.extractItemDate(item);

                if (date) {
                    // Only include items from current week
                    if (currentWeekDates.includes(date)) {
                        dateExtractedCount++;
                        currentWeekEntries++;
                        if (!this.entries.has(date)) {
                            this.entries.set(date, []);
                        }

                        const entryData = {
                            id: item.id,
                            activityType: this.extractStatusValue(item),
                            customer: this.extractColumnValue(item, 'text__1'),
                            workItem: this.extractColumnValue(item, 'text8__1'),
                            comment: this.extractCommentValue(item),
                            hours: this.extractColumnValue(item, 'numbers__1')
                        };

                        this.logger.log(`✅ Adding entry for ${date}: ${entryData.customer} - ${entryData.hours}h`);
                        this.entries.get(date).push(entryData);
                    } else {
                        this.logger.log(`⚠️ Entry for ${date} is outside current week`, 'debug');
                    }
                } else {
                    this.logger.log(`❌ Could not extract date for user item: ${item.name}`);
                }
            } else {
                this.logger.log(`❌ Item does not match user: ${item.name}`, 'debug');
            }
        });

        this.logger.endTimer(processTimer);
        this.logger.log(`Processing summary: ${userMatchCount} user matches, ${dateExtractedCount} with dates in current week`);
        this.logger.log(`Current week entries: ${currentWeekEntries}`);

        // Log entries for each date in current week
        currentWeekDates.forEach(date => {
            const entries = this.entries.get(date) || [];
            this.logger.log(`Date ${date}: ${entries.length} entries`);
            entries.forEach(entry => {
                this.logger.log(`  - ${entry.customer}: ${entry.hours}h (${this.getActivityTypeName(entry.activityType)})`);
            });
        });
    }

    isUserItem(item) {
        if (!this.user) {
            return false;
        }

        this.logger.log(`Checking user match for item: ${item.name}`, 'debug');

        // Method 1: Check if item name contains user name (most common case)
        if (item.name && item.name.includes(this.user.name)) {
            this.logger.log(`✅ Matched by item name: ${item.name} contains ${this.user.name}`);
            return true;
        }

        // Method 2: Check person column in column_values
        if (item.column_values) {
            for (const col of item.column_values) {
                if (col.id === 'person') {
                    this.logger.log(`Found person column: ${JSON.stringify(col)}`, 'debug');

                    // Check value field (JSON format)
                    if (col.value && col.value !== 'null' && col.value !== '""') {
                        try {
                            const personData = JSON.parse(col.value);
                            this.logger.log(`Parsed person data: ${JSON.stringify(personData)}`, 'debug');

                            if (personData.personsAndTeams && Array.isArray(personData.personsAndTeams)) {
                                const isUser = personData.personsAndTeams.some(person => {
                                    const match = person.id === this.user.id;
                                    if (match) {
                                        this.logger.log(`✅ Matched by person ID: ${person.id} === ${this.user.id}`);
                                    }
                                    return match;
                                });
                                if (isUser) return true;
                            }
                        } catch (e) {
                            this.logger.log(`Failed to parse person JSON: ${e.message}`, 'debug');
                        }
                    }

                    // Check text field
                    if (col.text && col.text !== 'null' && col.text !== '""') {
                        if (col.text.includes(this.user.name) || col.text.includes(this.user.email)) {
                            this.logger.log(`✅ Matched by person text: ${col.text}`);
                            return true;
                        }

                        // Try to parse text as JSON
                        try {
                            const textData = JSON.parse(col.text);
                            if (textData.personsAndTeams && Array.isArray(textData.personsAndTeams)) {
                                const isUser = textData.personsAndTeams.some(person =>
                                    person.id === this.user.id
                                );
                                if (isUser) {
                                    this.logger.log(`✅ Matched by parsed text JSON`);
                                    return true;
                                }
                            }
                        } catch (e) {
                            // Text is not JSON, continue
                        }
                    }
                }
            }
        }

        this.logger.log(`❌ No user match found for item: ${item.name}`);
        return false;
    }

    extractItemDate(item) {
        if (!item.column_values) {
            this.logger.log('No column values found for item', 'debug');
            return null;
        }

        for (const col of item.column_values) {
            if (col.id === 'date4') {
                this.logger.log(`Found date4 column: ${JSON.stringify(col)}`, 'debug');

                // Try to extract from value field (JSON format)
                if (col.value && col.value !== 'null' && col.value !== '""') {
                    try {
                        const value = JSON.parse(col.value);
                        this.logger.log(`Parsed date value: ${JSON.stringify(value)}`, 'debug');

                        if (value && value.date) {
                            // Extract just the date part (YYYY-MM-DD)
                            const dateStr = value.date.split('T')[0];
                            this.logger.log(`✅ Extracted date from JSON value: ${dateStr}`);
                            return dateStr;
                        }
                    } catch (e) {
                        this.logger.log(`Failed to parse date JSON: ${e.message}`, 'debug');
                    }
                }

                // Try text field as fallback
                if (col.text && col.text !== 'null' && col.text !== '""') {
                    const dateStr = col.text.split('T')[0];
                    // Validate it's a proper date format
                    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        this.logger.log(`✅ Extracted date from text field: ${dateStr}`);
                        return dateStr;
                    } else {
                        this.logger.log(`Invalid date format in text: ${dateStr}`, 'debug');
                    }
                }

                this.logger.log(`❌ Could not extract date from date4 column`);
            }
        }

        this.logger.log(`❌ No date4 column found or no valid date value`);
        return null;
    }

    extractColumnValue(item, columnId) {
        if (!item.column_values) return '';

        for (const col of item.column_values) {
            if (col.id === columnId) {
                this.logger.log(`Found column ${columnId}: ${JSON.stringify(col)}`, 'debug');

                if (col.text && col.text !== 'null' && col.text !== '""') {
                    this.logger.log(`✅ Using text value for ${columnId}: ${col.text}`);
                    return col.text;
                }
                if (col.value && col.value !== 'null' && col.value !== '""') {
                    // Try to parse JSON value
                    try {
                        const value = JSON.parse(col.value);
                        this.logger.log(`Parsed JSON value for ${columnId}: ${JSON.stringify(value)}`, 'debug');

                        if (typeof value === 'string') {
                            this.logger.log(`✅ Using string value for ${columnId}: ${value}`);
                            return value;
                        }
                        if (value && value.text) {
                            this.logger.log(`✅ Using value.text for ${columnId}: ${value.text}`);
                            return value.text;
                        }
                    } catch (e) {
                        this.logger.log(`✅ Using raw value for ${columnId}: ${col.value}`);
                        return col.value;
                    }
                }
            }
        }

        this.logger.log(`❌ Column ${columnId} not found or empty`);
        return '';
    }

    extractCommentValue(item) {
        return this.extractColumnValue(item, 'text2__1');
    }

    extractStatusValue(item) {
        if (!item.column_values) return 1;

        for (const col of item.column_values) {
            if (col.id === 'status' && col.value && col.value !== 'null' && col.value !== '""') {
                try {
                    const value = JSON.parse(col.value);
                    if (value && typeof value.index === 'number') {
                        return value.index;
                    }
                } catch (e) {
                    if (col.text) {
                        const text = col.text.toLowerCase();
                        const statusMap = {
                            'vacation': 0, 'billable': 1, 'holding': 2, 'education': 3,
                            'work reduction': 4, 'tbd': 5, 'holiday': 6, 'presales': 7,
                            'illness': 8, 'paid not worked': 9, 'intellectual capital': 10,
                            'business development': 11, 'overhead': 12
                        };
                        for (const [key, value] of Object.entries(statusMap)) {
                            if (text.includes(key)) return value;
                        }
                    }
                }
            }
        }
        return 1;
    }

    previousWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
        this.renderCalendarView();
        this.loadData();
    }

    nextWeek() {
        this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
        this.renderCalendarView();
        this.loadData();
    }

    selectWeek(dateString) {
        this.currentWeekStart = this.getMonday(new Date(dateString));
        this.renderCalendarView();
        this.loadData();
    }

    showLoading(message = 'Loading...', details = '') {
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('loadingDetails').textContent = details;
        document.getElementById('loadingOverlay').style.display = 'flex';
        this.logger.log(`Showing loading: ${message} - ${details}`, 'debug');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
        this.logger.log('Hiding loading overlay', 'debug');
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;

        setTimeout(() => notification.classList.remove('hidden'), 100);

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }
}

// Initialize the app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.diagnosticLogger.log('📄 DOM Content Loaded - Starting app initialization');
    try {
        new ClaimWebApp();
    } catch (error) {
        window.diagnosticLogger.log(`💥 App initialization crashed: ${error.message}`, 'error');
        window.diagnosticLogger.showLogger();
    }
});

window.addEventListener('load', () => {
    window.diagnosticLogger.log('🔄 Window fully loaded');
});

window.addEventListener('beforeunload', () => {
    window.diagnosticLogger.log('👋 Page unloading');
});