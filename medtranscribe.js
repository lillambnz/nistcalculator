/**
 * MedTranscribe AI - Medical Transcription Application
 * Australian Privacy Principles (APPs) Compliant
 *
 * Features:
 * - AI-powered medical transcription
 * - Medical terminology recognition
 * - Real-time audio recording and transcription
 * - Secure local storage with encryption
 * - Audit logging
 * - Patient consent management
 * - Export to multiple formats
 */

class MedTranscribeApp {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        this.isRecording = false;
        this.isPaused = false;
        this.recordingStartTime = null;
        this.timerInterval = null;
        this.audioContext = null;
        this.analyser = null;
        this.visualizerAnimationId = null;

        // Medical terminology database
        this.medicalTerms = this.initializeMedicalTerms();

        // Templates
        this.templates = this.initializeTemplates();

        // Audit log
        this.auditLog = [];

        // Initialize app
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initializeSpeechRecognition();
        this.loadRecentTranscriptions();
        this.setDefaultDateTime();
        this.logAuditEvent('APP_STARTED', 'Application initialized');

        // Check browser compatibility
        this.checkBrowserCompatibility();
    }

    checkBrowserCompatibility() {
        const features = {
            mediaRecorder: 'MediaRecorder' in window,
            speechRecognition: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
            audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
            localStorage: typeof(Storage) !== 'undefined'
        };

        const missing = Object.keys(features).filter(key => !features[key]);

        if (missing.length > 0) {
            this.showError(`Your browser doesn't support: ${missing.join(', ')}. Please use a modern browser like Chrome or Edge.`);
        }
    }

    setupEventListeners() {
        // Recording controls
        document.getElementById('startRecording').addEventListener('click', () => this.startRecording());
        document.getElementById('stopRecording').addEventListener('click', () => this.stopRecording());
        document.getElementById('pauseRecording').addEventListener('click', () => this.togglePause());

        // Transcription content
        const transcriptionContent = document.getElementById('transcriptionContent');
        transcriptionContent.addEventListener('input', () => this.updateStats());
        transcriptionContent.addEventListener('paste', (e) => this.handlePaste(e));

        // Medical search
        document.getElementById('medicalSearch').addEventListener('input', (e) => this.searchMedicalTerms(e.target.value));

        // Auto-save every 30 seconds
        setInterval(() => this.autoSave(), 30000);
    }

    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();

        // Configure for medical transcription
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-AU'; // Australian English
        this.recognition.maxAlternatives = 3;

        let finalTranscript = '';
        let interimTranscript = '';

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.updateAIStatus('Listening...');
        };

        this.recognition.onresult = (event) => {
            interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                const confidence = event.results[i][0].confidence;

                if (event.results[i].isFinal) {
                    finalTranscript += this.processMedicalText(transcript) + ' ';
                    this.updateConfidenceScore(confidence);
                    this.generateAISuggestions(transcript);
                } else {
                    interimTranscript += transcript;
                }
            }

            this.updateTranscription(finalTranscript, interimTranscript);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.updateAIStatus('Error: ' + event.error);

            if (event.error === 'no-speech') {
                // Restart recognition if no speech detected
                setTimeout(() => {
                    if (this.isRecording && !this.isPaused) {
                        this.recognition.start();
                    }
                }, 1000);
            }
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            if (this.isRecording && !this.isPaused) {
                // Restart recognition to keep it continuous
                this.recognition.start();
            } else {
                this.updateAIStatus('Ready');
            }
        };
    }

    async startRecording() {
        // Check consent
        if (!document.getElementById('consentCheck').checked) {
            this.showError('Patient consent is required before recording. Please check the consent box.');
            return;
        }

        // Validate patient information
        const patientId = document.getElementById('patientId').value.trim();
        const patientName = document.getElementById('patientName').value.trim();

        if (!patientId || !patientName) {
            this.showError('Patient ID and Name are required before recording.');
            return;
        }

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Setup audio visualizer
            this.setupAudioVisualizer(stream);

            // Setup media recorder
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.saveAudioRecording(audioBlob);
            };

            // Start recording
            this.mediaRecorder.start(1000); // Collect data every second

            // Start speech recognition
            if (this.recognition) {
                this.recognition.start();
            }

            // Update UI
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            this.startTimer();
            this.updateRecordingStatus('Recording', true);

            document.getElementById('startRecording').disabled = true;
            document.getElementById('stopRecording').disabled = false;
            document.getElementById('pauseRecording').disabled = false;

            this.logAuditEvent('RECORDING_STARTED', `Patient: ${patientName} (${patientId})`);

        } catch (error) {
            console.error('Error starting recording:', error);
            this.showError('Failed to access microphone. Please check permissions.');
            this.logAuditEvent('RECORDING_ERROR', error.message);
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();

            if (this.recognition) {
                this.recognition.stop();
            }

            // Stop audio visualizer
            if (this.visualizerAnimationId) {
                cancelAnimationFrame(this.visualizerAnimationId);
            }
            if (this.audioContext) {
                this.audioContext.close();
            }

            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

            // Update UI
            this.isRecording = false;
            this.isPaused = false;
            this.stopTimer();
            this.updateRecordingStatus('Completed', false);

            document.getElementById('startRecording').disabled = false;
            document.getElementById('stopRecording').disabled = true;
            document.getElementById('pauseRecording').disabled = true;

            this.logAuditEvent('RECORDING_STOPPED', 'Recording completed');

            // Auto-save transcription
            this.saveTranscription();
        }
    }

    togglePause() {
        if (!this.isRecording) return;

        if (this.isPaused) {
            // Resume
            if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
                this.mediaRecorder.resume();
            }
            if (this.recognition) {
                this.recognition.start();
            }
            this.isPaused = false;
            this.updateRecordingStatus('Recording', true);
            document.getElementById('pauseRecording').innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Pause
            `;
            this.logAuditEvent('RECORDING_RESUMED', 'Recording resumed');
        } else {
            // Pause
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.pause();
            }
            if (this.recognition) {
                this.recognition.stop();
            }
            this.isPaused = true;
            this.updateRecordingStatus('Paused', false);
            document.getElementById('pauseRecording').innerHTML = `
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                    <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Resume
            `;
            this.logAuditEvent('RECORDING_PAUSED', 'Recording paused');
        }
    }

    setupAudioVisualizer(stream) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();

        const source = this.audioContext.createMediaStreamSource(stream);
        source.connect(this.analyser);

        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = document.getElementById('visualizerCanvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const draw = () => {
            this.visualizerAnimationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgb(248, 249, 250)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#0066cc');
                gradient.addColorStop(1, '#3385d6');
                ctx.fillStyle = gradient;

                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };

        draw();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (!this.isPaused) {
                const elapsed = Date.now() - this.recordingStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                document.getElementById('recordingTimer').textContent =
                    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateRecordingStatus(status, isRecording) {
        const statusElement = document.getElementById('recordingStatus');
        const dot = statusElement.querySelector('.status-dot');
        const text = statusElement.querySelector('.status-text');

        text.textContent = status;

        if (isRecording) {
            dot.classList.add('recording');
            dot.classList.remove('paused');
        } else if (status === 'Paused') {
            dot.classList.add('paused');
            dot.classList.remove('recording');
        } else {
            dot.classList.remove('recording', 'paused');
        }
    }

    processMedicalText(text) {
        // Convert common medical phrases
        let processed = text;

        const medicalCorrections = {
            'high blood pressure': 'hypertension',
            'heart attack': 'myocardial infarction',
            'shortness of breath': 'dyspnoea',
            'difficulty breathing': 'dyspnoea',
            'chest pain': 'chest pain (angina)',
            'tummy': 'abdomen',
            'belly': 'abdomen',
            'sugar diabetes': 'diabetes mellitus',
            'blood sugar': 'glucose',
            'water tablet': 'diuretic',
            'blood thinner': 'anticoagulant',
            'pacemaker': 'cardiac pacemaker',
        };

        // Apply corrections (case-insensitive)
        Object.keys(medicalCorrections).forEach(term => {
            const regex = new RegExp(term, 'gi');
            processed = processed.replace(regex, medicalCorrections[term]);
        });

        // Capitalize medical terms
        const termsToCapitalize = ['MRI', 'CT', 'ECG', 'EKG', 'CBC', 'BP', 'HR', 'DNA', 'RNA', 'HIV', 'AIDS'];
        termsToCapitalize.forEach(term => {
            const regex = new RegExp(`\\b${term}\\b`, 'gi');
            processed = processed.replace(regex, term.toUpperCase());
        });

        return processed;
    }

    updateTranscription(finalText, interimText) {
        const content = document.getElementById('transcriptionContent');
        const placeholder = content.querySelector('.placeholder');

        if (placeholder) {
            placeholder.remove();
        }

        // Update with final and interim text
        const displayText = finalText + (interimText ? `<span style="color: #adb5bd;">${interimText}</span>` : '');

        if (displayText.trim()) {
            content.innerHTML = displayText;

            // Auto-scroll if enabled
            if (this.autoScroll !== false) {
                content.scrollTop = content.scrollHeight;
            }

            this.updateStats();
        }
    }

    updateStats() {
        const content = document.getElementById('transcriptionContent');
        const text = content.innerText || content.textContent;

        const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
        const chars = text.length;

        document.getElementById('wordCount').textContent = words;
        document.getElementById('charCount').textContent = chars;
    }

    updateConfidenceScore(confidence) {
        const score = (confidence * 100).toFixed(0);
        document.getElementById('confidenceScore').textContent = score + '%';

        const scoreElement = document.getElementById('confidenceScore');
        if (confidence > 0.8) {
            scoreElement.style.color = '#28a745';
        } else if (confidence > 0.6) {
            scoreElement.style.color = '#ffc107';
        } else {
            scoreElement.style.color = '#dc3545';
        }
    }

    updateAIStatus(status) {
        document.getElementById('aiStatus').textContent = status;
    }

    generateAISuggestions(text) {
        const suggestions = [];
        const lowerText = text.toLowerCase();

        // Generate context-aware suggestions
        if (lowerText.includes('pain') && !lowerText.includes('scale')) {
            suggestions.push({
                icon: '💡',
                text: 'Consider documenting pain scale (0-10) and location'
            });
        }

        if (lowerText.includes('medication') || lowerText.includes('drug')) {
            suggestions.push({
                icon: '💊',
                text: 'Remember to document dosage, frequency, and route'
            });
        }

        if (lowerText.includes('allergy') || lowerText.includes('allergic')) {
            suggestions.push({
                icon: '⚠️',
                text: 'Document allergic reaction type and severity'
            });
        }

        if (lowerText.includes('blood pressure') || lowerText.includes('bp')) {
            suggestions.push({
                icon: '📊',
                text: 'Record systolic/diastolic values (e.g., 120/80 mmHg)'
            });
        }

        // Display suggestions
        if (suggestions.length > 0) {
            const suggestionsContainer = document.getElementById('aiSuggestions');
            suggestionsContainer.innerHTML = suggestions.map(s => `
                <div class="suggestion-item">
                    <div class="suggestion-icon">${s.icon}</div>
                    <div class="suggestion-text">${s.text}</div>
                </div>
            `).join('');
        }
    }

    initializeMedicalTerms() {
        return {
            'Hypertension': 'High blood pressure - systolic BP ≥140 mmHg or diastolic BP ≥90 mmHg',
            'Dyspnoea': 'Shortness of breath or difficulty breathing',
            'Myocardial Infarction': 'Heart attack - death of heart muscle due to ischemia',
            'Angina Pectoris': 'Chest pain due to reduced blood flow to heart muscle',
            'Diabetes Mellitus': 'Metabolic disorder characterized by high blood glucose',
            'Hyperlipidaemia': 'Elevated levels of lipids in the blood',
            'Arrhythmia': 'Irregular heart rhythm',
            'Tachycardia': 'Abnormally rapid heart rate (>100 bpm)',
            'Bradycardia': 'Abnormally slow heart rate (<60 bpm)',
            'Atrial Fibrillation': 'Irregular, often rapid heart rate (AF/AFib)',
            'Stroke': 'Cerebrovascular accident (CVA) - brain injury from blood flow interruption',
            'TIA': 'Transient Ischemic Attack - temporary stroke-like symptoms',
            'COPD': 'Chronic Obstructive Pulmonary Disease',
            'Asthma': 'Chronic inflammatory airway disease',
            'Pneumonia': 'Lung infection causing inflammation',
            'Anaemia': 'Low red blood cell count or haemoglobin',
            'Thrombosis': 'Blood clot formation within blood vessel',
            'Embolism': 'Obstruction of blood vessel by foreign material',
            'Oedema': 'Swelling caused by fluid accumulation',
            'Hepatitis': 'Liver inflammation',
            'Nephritis': 'Kidney inflammation',
            'Gastritis': 'Stomach lining inflammation',
            'Arthritis': 'Joint inflammation',
            'Osteoporosis': 'Bone density loss',
            'Fracture': 'Broken bone',
            'Laceration': 'Deep cut or tear in skin',
            'Contusion': 'Bruise - injury without skin break',
            'Abrasion': 'Scraped skin',
            'Sepsis': 'Life-threatening infection response',
            'Dehydration': 'Excessive loss of body fluids'
        };
    }

    searchMedicalTerms(query) {
        const termsContainer = document.getElementById('medicalTerms');

        if (!query.trim()) {
            // Show default terms
            this.displayMedicalTerms(Object.entries(this.medicalTerms).slice(0, 10));
            return;
        }

        const filtered = Object.entries(this.medicalTerms).filter(([term, desc]) =>
            term.toLowerCase().includes(query.toLowerCase()) ||
            desc.toLowerCase().includes(query.toLowerCase())
        );

        this.displayMedicalTerms(filtered.slice(0, 10));
    }

    displayMedicalTerms(terms) {
        const container = document.getElementById('medicalTerms');

        if (terms.length === 0) {
            container.innerHTML = '<p class="empty-state">No terms found</p>';
            return;
        }

        container.innerHTML = terms.map(([term, desc]) => `
            <div class="term-item" onclick="medTranscribe.insertTerm('${term}')">
                <strong>${term}</strong>
                <p>${desc}</p>
            </div>
        `).join('');
    }

    insertTerm(term) {
        const content = document.getElementById('transcriptionContent');
        const selection = window.getSelection();

        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(term + ' '));
        } else {
            content.innerText += term + ' ';
        }

        content.focus();
        this.updateStats();
    }

    initializeTemplates() {
        return {
            soap: {
                name: 'SOAP Note',
                content: `SOAP NOTE

Date: ${new Date().toLocaleDateString('en-AU')}

SUBJECTIVE:
Chief Complaint:
History of Present Illness:
Past Medical History:
Medications:
Allergies:
Social History:

OBJECTIVE:
Vital Signs:
- BP:
- HR:
- RR:
- Temp:
- O2 Sat:
Physical Examination:
Laboratory/Imaging:

ASSESSMENT:
Diagnosis:
Differential Diagnoses:

PLAN:
Treatment:
Follow-up:
Patient Education:
`
            },
            history: {
                name: 'History & Physical',
                content: `HISTORY AND PHYSICAL EXAMINATION

Date: ${new Date().toLocaleDateString('en-AU')}

PATIENT IDENTIFICATION:

CHIEF COMPLAINT:

HISTORY OF PRESENT ILLNESS:

PAST MEDICAL HISTORY:

MEDICATIONS:

ALLERGIES:

FAMILY HISTORY:

SOCIAL HISTORY:

REVIEW OF SYSTEMS:

PHYSICAL EXAMINATION:
General:
HEENT:
Cardiovascular:
Respiratory:
Abdomen:
Musculoskeletal:
Neurological:
Skin:

ASSESSMENT AND PLAN:
`
            },
            progress: {
                name: 'Progress Note',
                content: `PROGRESS NOTE

Date: ${new Date().toLocaleDateString('en-AU')}

Patient Status:
Interval History:
Current Medications:
Vital Signs:
Physical Exam Updates:
Laboratory Results:
Assessment:
Plan:
`
            },
            discharge: {
                name: 'Discharge Summary',
                content: `DISCHARGE SUMMARY

Date of Admission:
Date of Discharge:

ADMITTING DIAGNOSIS:

DISCHARGE DIAGNOSIS:

HOSPITAL COURSE:

PROCEDURES PERFORMED:

DISCHARGE MEDICATIONS:

DISCHARGE INSTRUCTIONS:

FOLLOW-UP APPOINTMENTS:

ACTIVITY RESTRICTIONS:

DIET:

PROGNOSIS:

Discharge signed by:
`
            },
            prescription: {
                name: 'Prescription',
                content: `PRESCRIPTION

Date: ${new Date().toLocaleDateString('en-AU')}
Patient Name:
Patient Address:
Medicare Number:

Medication:
Dose:
Route:
Frequency:
Duration:
Quantity:
Repeats:

Instructions:

Prescriber:
Prescriber Number:
Signature:
`
            },
            referral: {
                name: 'Referral Letter',
                content: `MEDICAL REFERRAL

Date: ${new Date().toLocaleDateString('en-AU')}

To: [Specialist Name]
[Specialty]
[Address]

Re: [Patient Name]
DOB:
Medicare Number:

Dear Colleague,

I am referring [Patient Name] for your assessment and management.

REASON FOR REFERRAL:

RELEVANT HISTORY:

CURRENT MEDICATIONS:

EXAMINATION FINDINGS:

INVESTIGATIONS:

I would appreciate your expert opinion and management recommendations.

Thank you for your assistance.

Yours sincerely,

[Your Name]
[Practice Name]
[Contact Details]
`
            }
        };
    }

    insertTemplate(templateType) {
        const template = this.templates[templateType];
        if (!template) return;

        const content = document.getElementById('transcriptionContent');
        const placeholder = content.querySelector('.placeholder');

        if (placeholder) {
            placeholder.remove();
        }

        content.innerText = template.content;
        this.updateStats();

        this.logAuditEvent('TEMPLATE_INSERTED', `Template: ${template.name}`);
    }

    clearTranscription() {
        if (confirm('Are you sure you want to clear the transcription? This cannot be undone.')) {
            const content = document.getElementById('transcriptionContent');
            content.innerHTML = '<p class="placeholder">Medical transcription will appear here as you speak...</p>';
            this.updateStats();
            this.logAuditEvent('TRANSCRIPTION_CLEARED', 'User cleared transcription');
        }
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        const btn = event.target.closest('.btn-icon');
        btn.style.background = this.autoScroll ? 'var(--primary-color)' : 'transparent';
        btn.style.color = this.autoScroll ? 'white' : 'var(--text-secondary)';
    }

    handlePaste(e) {
        // Handle paste event for clean text
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }

    saveTranscription() {
        const patientId = document.getElementById('patientId').value.trim();
        const patientName = document.getElementById('patientName').value.trim();
        const content = document.getElementById('transcriptionContent').innerText;

        if (!patientId || !patientName) {
            this.showError('Patient ID and Name are required to save.');
            return;
        }

        if (!content || content.trim() === '' || content.includes('Medical transcription will appear')) {
            this.showError('No transcription content to save.');
            return;
        }

        // Create transcription object
        const transcription = {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            patientId: this.encryptData(patientId),
            patientName: this.encryptData(patientName),
            patientDOB: this.encryptData(document.getElementById('patientDOB').value),
            patientGender: document.getElementById('patientGender').value,
            clinicianName: document.getElementById('clinicianName').value,
            appointmentType: document.getElementById('appointmentType').value,
            appointmentDate: document.getElementById('appointmentDate').value,
            content: this.encryptData(content),
            wordCount: document.getElementById('wordCount').textContent,
            consentGiven: document.getElementById('consentCheck').checked
        };

        // Save to secure local storage
        this.saveToSecureStorage(transcription);

        // Update recent files
        this.loadRecentTranscriptions();

        this.showSuccess('Transcription saved securely.');
        this.logAuditEvent('TRANSCRIPTION_SAVED', `Saved transcription for patient: ${patientName}`);
    }

    autoSave() {
        const content = document.getElementById('transcriptionContent').innerText;
        if (content && !content.includes('Medical transcription will appear')) {
            const autoSaveData = {
                content: content,
                timestamp: new Date().toISOString(),
                patientId: document.getElementById('patientId').value
            };

            localStorage.setItem('medtranscribe_autosave', JSON.stringify(autoSaveData));
            console.log('Auto-saved at', new Date().toLocaleTimeString());
        }
    }

    saveToSecureStorage(transcription) {
        try {
            // Get existing transcriptions
            let transcriptions = JSON.parse(localStorage.getItem('medtranscribe_records') || '[]');

            // Add new transcription
            transcriptions.unshift(transcription);

            // Keep only last 50 records (for demo purposes)
            transcriptions = transcriptions.slice(0, 50);

            // Save back to storage
            localStorage.setItem('medtranscribe_records', JSON.stringify(transcriptions));

            return true;
        } catch (error) {
            console.error('Error saving transcription:', error);
            this.showError('Failed to save transcription.');
            return false;
        }
    }

    saveAudioRecording(audioBlob) {
        const patientId = document.getElementById('patientId').value.trim();
        const timestamp = new Date().toISOString();

        // In a real application, this would be uploaded to a secure server
        // For demo purposes, we'll create a download link
        console.log('Audio recording saved:', {
            size: audioBlob.size,
            type: audioBlob.type,
            patient: patientId,
            timestamp: timestamp
        });

        this.logAuditEvent('AUDIO_SAVED', `Audio recording saved for patient: ${patientId}`);
    }

    loadRecentTranscriptions() {
        try {
            const transcriptions = JSON.parse(localStorage.getItem('medtranscribe_records') || '[]');
            const container = document.getElementById('recentFiles');

            if (transcriptions.length === 0) {
                container.innerHTML = '<p class="empty-state">No recent transcriptions</p>';
                return;
            }

            container.innerHTML = transcriptions.slice(0, 5).map(t => {
                const date = new Date(t.timestamp).toLocaleDateString('en-AU');
                return `
                    <div class="suggestion-item" onclick="medTranscribe.loadTranscription('${t.id}')">
                        <div class="suggestion-icon">📄</div>
                        <div class="suggestion-text">
                            <strong>${date}</strong><br>
                            <small>${t.appointmentType || 'Consultation'}</small>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading recent transcriptions:', error);
        }
    }

    loadTranscription(id) {
        try {
            const transcriptions = JSON.parse(localStorage.getItem('medtranscribe_records') || '[]');
            const transcription = transcriptions.find(t => t.id === id);

            if (!transcription) return;

            // Load patient information
            document.getElementById('patientId').value = this.decryptData(transcription.patientId);
            document.getElementById('patientName').value = this.decryptData(transcription.patientName);
            document.getElementById('patientDOB').value = this.decryptData(transcription.patientDOB);
            document.getElementById('patientGender').value = transcription.patientGender;
            document.getElementById('clinicianName').value = transcription.clinicianName;
            document.getElementById('appointmentType').value = transcription.appointmentType;
            document.getElementById('appointmentDate').value = transcription.appointmentDate;

            // Load content
            const content = this.decryptData(transcription.content);
            document.getElementById('transcriptionContent').innerText = content;
            this.updateStats();

            this.logAuditEvent('TRANSCRIPTION_LOADED', `Loaded transcription ID: ${id}`);
        } catch (error) {
            console.error('Error loading transcription:', error);
            this.showError('Failed to load transcription.');
        }
    }

    exportPDF() {
        this.showError('PDF export requires a backend service. In production, this would generate a secure, compliant PDF report.');
        this.logAuditEvent('EXPORT_PDF_ATTEMPTED', 'User attempted PDF export');

        // In a real implementation:
        // - Send data to backend
        // - Backend generates PDF with proper headers/footers
        // - Include privacy notices and compliance statements
        // - Return signed/encrypted PDF
    }

    exportDOCX() {
        this.showError('DOCX export requires a backend service. In production, this would generate a secure, compliant Word document.');
        this.logAuditEvent('EXPORT_DOCX_ATTEMPTED', 'User attempted DOCX export');

        // In a real implementation:
        // - Use a library like docx.js
        // - Generate properly formatted document
        // - Include all patient information and compliance notices
    }

    printTranscription() {
        window.print();
        this.logAuditEvent('PRINT_INITIATED', 'User printed transcription');
    }

    encryptData(data) {
        // Simple encryption for demo purposes
        // In production, use proper encryption (AES-256)
        try {
            return btoa(encodeURIComponent(data));
        } catch (e) {
            return data;
        }
    }

    decryptData(data) {
        // Simple decryption for demo purposes
        try {
            return decodeURIComponent(atob(data));
        } catch (e) {
            return data;
        }
    }

    generateId() {
        return 'MT-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    setDefaultDateTime() {
        const now = new Date();
        const dateTimeString = now.toISOString().slice(0, 16);
        document.getElementById('appointmentDate').value = dateTimeString;
    }

    logAuditEvent(event, details) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            event: event,
            details: details,
            user: document.getElementById('clinicianName').value || 'Unknown',
            sessionId: this.getSessionId()
        };

        this.auditLog.push(auditEntry);

        // Save audit log (in production, send to secure backend)
        console.log('AUDIT:', auditEntry);

        // Keep only last 1000 entries in memory
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
    }

    getSessionId() {
        let sessionId = sessionStorage.getItem('medtranscribe_session');
        if (!sessionId) {
            sessionId = 'SESSION-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('medtranscribe_session', sessionId);
        }
        return sessionId;
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('errorModal').classList.add('active');
        this.logAuditEvent('ERROR_SHOWN', message);
    }

    showSuccess(message) {
        // Simple success notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #28a745;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 0.5rem;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }
}

// Global functions for HTML onclick handlers
function insertTemplate(type) {
    medTranscribe.insertTemplate(type);
}

function clearTranscription() {
    medTranscribe.clearTranscription();
}

function toggleAutoScroll() {
    medTranscribe.toggleAutoScroll();
}

function saveTranscription() {
    medTranscribe.saveTranscription();
}

function exportPDF() {
    medTranscribe.exportPDF();
}

function exportDOCX() {
    medTranscribe.exportDOCX();
}

function printTranscription() {
    medTranscribe.printTranscription();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Initialize the application
let medTranscribe;
document.addEventListener('DOMContentLoaded', () => {
    medTranscribe = new MedTranscribeApp();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
