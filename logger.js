// logger.js
class DiagnosticLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.isEnabled = true;
        this.progress = {
            current: 0,
            total: 100,
            message: ''
        };
        this.initializeLogger();
    }

    initializeLogger() {
        // Create logger UI if it doesn't exist
        if (!document.getElementById('diagnosticLogger')) {
            const loggerDiv = document.createElement('div');
            loggerDiv.id = 'diagnosticLogger';
            loggerDiv.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 200px;
                background: #1e1e1e;
                color: #00ff00;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                border-top: 2px solid #333;
                z-index: 10000;
                overflow-y: auto;
                display: none;
            `;

            const loggerHeader = document.createElement('div');
            loggerHeader.style.cssText = `
                background: #333;
                padding: 5px 10px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #555;
            `;
            loggerHeader.innerHTML = `
                <strong>Diagnostic Logger</strong>
                <div>
                    <button id="clearLogs" style="margin-right: 10px; background: #666; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Clear</button>
                    <button id="toggleLogger" style="background: #666; color: white; border: none; padding: 2px 8px; border-radius: 3px; cursor: pointer;">Show</button>
                </div>
            `;

            const loggerContent = document.createElement('div');
            loggerContent.id = 'loggerContent';
            loggerContent.style.cssText = `
                padding: 10px;
                height: calc(100% - 40px);
                overflow-y: auto;
                font-family: 'Courier New', monospace;
                font-size: 12px;
            `;

            loggerDiv.appendChild(loggerHeader);
            loggerDiv.appendChild(loggerContent);
            document.body.appendChild(loggerDiv);

            // Add event listeners
            document.getElementById('clearLogs').addEventListener('click', () => this.clearLogs());
            document.getElementById('toggleLogger').addEventListener('click', () => this.toggleLogger());
        }
    }

    log(message, type = 'info') {
        if (!this.isEnabled) return;

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message,
            type
        };

        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Also log to console
        const consoleMethod = type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[${timestamp}] ${message}`);

        // Update UI if visible
        this.updateLoggerUI();
    }

    updateLoggerUI() {
        const loggerContent = document.getElementById('loggerContent');
        const loggerDiv = document.getElementById('diagnosticLogger');
        if (loggerContent && loggerDiv && loggerDiv.style.display !== 'none') {
            const lastLog = this.logs[this.logs.length - 1];
            const logElement = document.createElement('div');
            logElement.style.cssText = `
                margin-bottom: 2px;
                padding: 2px 5px;
                border-left: 3px solid ${this.getColorForType(lastLog.type)};
                background: ${lastLog.type === 'error' ? '#330000' : 'transparent'};
                font-family: 'Courier New', monospace;
                font-size: 12px;
            `;
            logElement.innerHTML = `
                <span style="color: #888;">[${lastLog.timestamp}]</span>
                <span style="color: ${this.getColorForType(lastLog.type)};">${lastLog.message}</span>
            `;
            loggerContent.appendChild(logElement);
            loggerContent.scrollTop = loggerContent.scrollHeight;
        }
    }

    getColorForType(type) {
        const colors = {
            info: '#00ff00',
            warn: '#ffff00',
            error: '#ff0000',
            debug: '#00ffff'
        };
        return colors[type] || '#ffffff';
    }

    clearLogs() {
        this.logs = [];
        const loggerContent = document.getElementById('loggerContent');
        if (loggerContent) {
            loggerContent.innerHTML = '';
        }
    }

    toggleLogger() {
        const logger = document.getElementById('diagnosticLogger');
        const toggleButton = document.getElementById('toggleLogger');
        if (logger.style.display === 'none') {
            logger.style.display = 'block';
            toggleButton.textContent = 'Hide';
            this.updateLoggerUI();
        } else {
            logger.style.display = 'none';
            toggleButton.textContent = 'Show';
        }
    }

    showLogger() {
        const logger = document.getElementById('diagnosticLogger');
        const toggleButton = document.getElementById('toggleLogger');
        if (logger) {
            logger.style.display = 'block';
            if (toggleButton) toggleButton.textContent = 'Hide';
            this.updateLoggerUI();
        }
    }

    // Progress tracking methods
    setProgress(current, total, message = '') {
        this.progress = { current, total, message };
        this.updateProgressBar();
    }

    updateProgressBar() {
        // Implementation if needed
    }

    // Performance monitoring
    startTimer(label) {
        const timer = {
            label,
            startTime: performance.now(),
            endTime: null
        };
        this.log(`⏱️ START: ${label}`, 'debug');
        return timer;
    }

    endTimer(timer) {
        timer.endTime = performance.now();
        const duration = timer.endTime - timer.startTime;
        this.log(`⏱️ END: ${timer.label} - ${duration.toFixed(2)}ms`, 'debug');
        return duration;
    }

    // Method to check if app is responsive
    startResponsivenessCheck() {
        let lastCheck = performance.now();
        const checkInterval = setInterval(() => {
            const now = performance.now();
            const delta = now - lastCheck;
            if (delta > 2000) { // If more than 2 seconds between checks, app might be frozen
                this.log(`⚠️ Possible app freeze detected - ${delta.toFixed(0)}ms since last check`, 'warn');
            }
            lastCheck = now;
        }, 1000);
        return checkInterval;
    }
}

// Global logger instance
window.diagnosticLogger = new DiagnosticLogger();

// Auto-show logger on errors
window.addEventListener('error', (event) => {
    window.diagnosticLogger.log(`Unhandled error: ${event.error?.message || event.message}`, 'error');
    window.diagnosticLogger.showLogger();
});

window.addEventListener('unhandledrejection', (event) => {
    window.diagnosticLogger.log(`Unhandled promise rejection: ${event.reason}`, 'error');
    window.diagnosticLogger.showLogger();
});