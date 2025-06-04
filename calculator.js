class NISTCalculator {
    constructor() {
        this.controlFamilies = {
            'AC': { name: 'Access Control', weight: 0.12 },
            'AT': { name: 'Awareness and Training', weight: 0.02 },
            'AU': { name: 'Audit and Accountability', weight: 0.08 },
            'CA': { name: 'Assessment, Authorization, and Monitoring', weight: 0.04 },
            'CM': { name: 'Configuration Management', weight: 0.07 },
            'CP': { name: 'Contingency Planning', weight: 0.05 },
            'IA': { name: 'Identification and Authentication', weight: 0.11 },
            'IR': { name: 'Incident Response', weight: 0.08 },
            'MA': { name: 'Maintenance', weight: 0.03 },
            'MP': { name: 'Media Protection', weight: 0.02 },
            'PE': { name: 'Physical and Environmental Protection', weight: 0.03 },
            'PL': { name: 'Planning', weight: 0.02 },
            'PM': { name: 'Program Management', weight: 0.03 },
            'PS': { name: 'Personnel Security', weight: 0.02 },
            'PT': { name: 'Privacy Controls', weight: 0.02 },
            'RA': { name: 'Risk Assessment', weight: 0.06 },
            'SA': { name: 'System and Services Acquisition', weight: 0.04 },
            'SC': { name: 'System and Communications Protection', weight: 0.15 },
            'SI': { name: 'System and Information Integrity', weight: 0.11 },
            'SR': { name: 'Supply Chain Risk Management', weight: 0.04 }
        };
        this.assessments = {};
    }
    calculatePDRScore(protect, detect, respond) {
        const weightedScore = (protect * 0.4) + (detect * 0.3) + (respond * 0.3);
        return (weightedScore / 3.0) * 5.0;
    }
    calculateImplementationMultiplier(status, percentage) {
        const statusMultipliers = [0.0, 0.4, 0.7, 1.0];
        const baseMultiplier = statusMultipliers[status];
        const percentageFactor = percentage / 100.0;
        return Math.min((baseMultiplier * 0.7) + (percentageFactor * 0.3), 1.0);
    }
    addControl(family, controlId, protect, detect, respond, status, percentage) {
        if (!this.assessments[family]) {
            this.assessments[family] = [];
        }
        const pdrScore = this.calculatePDRScore(protect, detect, respond);
        const implMultiplier = this.calculateImplementationMultiplier(status, percentage);
        const finalScore = Math.min(pdrScore * implMultiplier, 5.0);
        this.assessments[family].push({
            controlId,
            protect,
            detect,
            respond,
            status,
            percentage,
            pdrScore: Math.round(pdrScore * 100) / 100,
            implMultiplier: Math.round(implMultiplier * 100) / 100,
            finalScore: Math.round(finalScore * 100) / 100
        });
        this.updateDisplay();
    }
    calculateOverallScore() {
        let totalWeightedScore = 0;
        let totalWeight = 0;
        for (const [family, controls] of Object.entries(this.assessments)) {
            if (controls.length > 0) {
                const familyScore = controls.reduce((sum, control) => sum + control.finalScore, 0) / controls.length;
                const weight = this.controlFamilies[family].weight;
                totalWeightedScore += familyScore * weight;
                totalWeight += weight;
            }
        }
        return totalWeight > 0 ? Math.round((totalWeightedScore / totalWeight) * 100) / 100 : 0;
    }
    updateDisplay() {
        const overallScore = this.calculateOverallScore();
        document.getElementById('overallScore').textContent = `Overall Score: ${overallScore}/5.0 (${Math.round(overallScore/5*100)}%)`;
        // Update family scores
        let familyHTML = '';
        for (const [family, info] of Object.entries(this.controlFamilies)) {
            const controls = this.assessments[family] || [];
            if (controls.length > 0) {
                const familyScore = controls.reduce((sum, control) => sum + control.finalScore, 0) / controls.length;
                familyHTML += `
                    <div class="family"><strong>${family} - ${info.name}:</strong> ${Math.round(familyScore * 100) / 100}/5.0 (${controls.length} controls)</div>
                `;
            }
        }
        document.getElementById('familyScores').innerHTML = familyHTML;
        // Update control list
        let controlHTML = '';
        for (const [family, controls] of Object.entries(this.assessments)) {
            controls.forEach(control => {
                controlHTML += `
                    <div class="control">
                        <strong>${control.controlId}</strong> (${family}) - Score: ${control.finalScore}/5.0
                        <br><small>PDR: ${control.pdrScore}, Implementation: ${control.implMultiplier}</small>
                    </div>
                `;
            });
        }
        document.getElementById('controlList').innerHTML = controlHTML;
    }
}
const calculator = new NISTCalculator();
function addControl() {
    const family = document.getElementById('controlFamily').value;
    const controlId = document.getElementById('controlId').value;
    const protect = parseInt(document.getElementById('protectScore').value);
    const detect = parseInt(document.getElementById('detectScore').value);
    const respond = parseInt(document.getElementById('respondScore').value);
    const status = parseInt(document.getElementById('implementationStatus').value);
    const percentage = parseFloat(document.getElementById('implementationPercentage').value) || 0;
    if (controlId) {
        calculator.addControl(family, controlId, protect, detect, respond, status, percentage);
        document.getElementById('controlId').value = '';
        document.getElementById('implementationPercentage').value = '';
    }
}
calculator.updateDisplay();
