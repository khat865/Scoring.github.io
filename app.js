// ==================== 配置 ====================
const CONFIG = {
    dataFile: 'data.json',  // 数据文件路径
    storageKey: 'ratingProgress',  // LocalStorage键名
    batchSize: 50  // 每次处理的数据批次大小
};

// ==================== 状态管理 ====================
class RatingState {
    constructor() {
        this.data = [];
        this.currentIndex = 0;
        this.ratings = [];
        this.currentRating = null;
        this.startTime = null;
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKey);
            if (saved) {
                const parsed = JSON.parse(saved);
                this.currentIndex = parsed.currentIndex || 0;
                this.ratings = parsed.ratings || [];
                this.startTime = parsed.startTime || new Date().toISOString();
                return true;
            }
        } catch (error) {
            console.error('加载进度失败:', error);
        }
        this.startTime = new Date().toISOString();
        return false;
    }

    saveToStorage() {
        try {
            const saveData = {
                currentIndex: this.currentIndex,
                ratings: this.ratings,
                startTime: this.startTime,
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(saveData));
            return true;
        } catch (error) {
            console.error('保存进度失败:', error);
            return false;
        }
    }

    clearStorage() {
        localStorage.removeItem(CONFIG.storageKey);
    }

    setRating(index, score) {
        this.ratings[index] = score;
        this.currentRating = score;
    }

    getRating(index) {
        return this.ratings[index];
    }

    hasRating(index) {
        return this.ratings[index] !== undefined;
    }

    getTotalRated() {
        return this.ratings.filter(r => r !== undefined).length;
    }

    isComplete() {
        return this.currentIndex >= this.data.length;
    }
}

// ==================== 数据加载器 ====================
class DataLoader {
    static async loadData() {
        try {
            const response = await fetch(CONFIG.dataFile);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (!Array.isArray(data)) {
                throw new Error('数据格式错误：应该是数组');
            }

            // 验证数据格式
            data.forEach((item, index) => {
                if (!item.image || !item.text) {
                    throw new Error(`数据项 ${index} 缺少必需字段`);
                }
            });

            return data;
        } catch (error) {
            console.error('加载数据失败:', error);
            throw error;
        }
    }
}

// ==================== UI管理器 ====================
class UIManager {
    constructor(state) {
        this.state = state;
        this.elements = {
            displayImage: document.getElementById('displayImage'),
            displayText: document.getElementById('displayText'),
            currentIndex: document.getElementById('currentIndex'),
            totalItems: document.getElementById('totalItems'),
            progressFill: document.getElementById('progressFill'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            saveProgressBtn: document.getElementById('saveProgressBtn'),
            mainContent: document.getElementById('mainContent'),
            ratingButtons: document.querySelectorAll('.rating-btn')
        };

        this.bindEvents();
    }

    bindEvents() {
        // 评分按钮
        this.elements.ratingButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectRating(parseInt(btn.dataset.score));
            });
        });

        // 导航按钮
        this.elements.nextBtn.addEventListener('click', () => this.nextPair());
        this.elements.prevBtn.addEventListener('click', () => this.prevPair());
        this.elements.saveProgressBtn.addEventListener('click', () => this.saveProgress());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                this.selectRating(parseInt(e.key));
            } else if (e.key === 'ArrowLeft' && !this.elements.prevBtn.disabled) {
                this.prevPair();
            } else if (e.key === 'ArrowRight' && !this.elements.nextBtn.disabled) {
                this.nextPair();
            }
        });
    }

    displayCurrentPair() {
        if (this.state.currentIndex < this.state.data.length) {
            const item = this.state.data[this.state.currentIndex];
            
            // 显示图片
            this.elements.displayImage.src = item.image;
            this.elements.displayImage.alt = `图片 ${this.state.currentIndex + 1}`;
            
            // 显示文本
            this.elements.displayText.textContent = item.text;
            
            // 更新索引显示
            this.elements.currentIndex.textContent = this.state.currentIndex + 1;
            
            // 恢复之前的评分
            if (this.state.hasRating(this.state.currentIndex)) {
                this.selectRating(this.state.getRating(this.state.currentIndex), false);
            } else {
                this.clearRatingSelection();
            }
            
            this.updateButtons();
            this.updateProgress();
        }
    }

    selectRating(score, saveRating = true) {
        // 清除所有选中状态
        this.elements.ratingButtons.forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // 选中当前按钮
        const selectedBtn = Array.from(this.elements.ratingButtons)
            .find(btn => parseInt(btn.dataset.score) === score);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        this.state.currentRating = score;
        
        if (saveRating) {
            this.state.setRating(this.state.currentIndex, score);
            this.state.saveToStorage();
        }
        
        this.elements.nextBtn.disabled = false;
    }

    clearRatingSelection() {
        this.elements.ratingButtons.forEach(btn => {
            btn.classList.remove('selected');
        });
        this.state.currentRating = null;
        this.elements.nextBtn.disabled = true;
    }

    nextPair() {
        if (this.state.currentRating === null) return;
        
        this.state.currentIndex++;
        
        if (this.state.isComplete()) {
            this.showCompletion();
        } else {
            this.displayCurrentPair();
        }
    }

    prevPair() {
        if (this.state.currentIndex > 0) {
            this.state.currentIndex--;
            this.displayCurrentPair();
        }
    }

    updateButtons() {
        this.elements.prevBtn.disabled = this.state.currentIndex === 0;
    }

    updateProgress() {
        const progress = (this.state.currentIndex / this.state.data.length) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
    }

    saveProgress() {
        if (this.state.saveToStorage()) {
            this.showNotification('进度已保存！', 'success');
        } else {
            this.showNotification('保存失败，请重试', 'error');
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        notification.style.background = type === 'success' ? '#28a745' : '#dc3545';
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showLoading() {
        this.elements.mainContent.innerHTML = `
            <div class="loading-message">
                <h2>正在加载数据...</h2>
                <p>请稍候</p>
            </div>
        `;
    }

    showError(error) {
        this.elements.mainContent.innerHTML = `
            <div class="error-message">
                <h2>❌ 加载失败</h2>
                <p>${error.message}</p>
                <p>请确保 data.json 文件存在且格式正确</p>
                <button class="btn btn-primary" onclick="location.reload()">重新加载</button>
            </div>
        `;
    }

    showCompletion() {
        const rated = this.state.getTotalRated();
        const total = this.state.data.length;
        
        this.elements.mainContent.innerHTML = `
            <div class="completion-message">
                <h2>🎉 评分完成！</h2>
                <p>您已完成 ${rated} / ${total} 个项目的评分</p>
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="app.downloadCSV()">下载评分结果 (CSV)</button>
                    <button class="btn btn-info" onclick="app.downloadJSON()">下载评分结果 (JSON)</button>
                    <button class="btn btn-secondary" onclick="app.restart()">重新开始</button>
                </div>
            </div>
        `;
    }

    init() {
        this.elements.totalItems.textContent = this.state.data.length;
        this.displayCurrentPair();
    }
}

// ==================== 导出管理器 ====================
class ExportManager {
    static generateCSV(state) {
        let csv = 'Index,Image_URL,Text,Rating,Start_Time,Complete_Time\n';
        
        state.data.forEach((item, index) => {
            const rating = state.ratings[index] || '';
            const completeTime = new Date().toISOString();
            const imageUrl = item.image.replace(/"/g, '""');
            const text = item.text.replace(/"/g, '""');
            
            csv += `${index + 1},"${imageUrl}","${text}",${rating},${state.startTime},${completeTime}\n`;
        });

        return csv;
    }

    static generateJSON(state) {
        const results = state.data.map((item, index) => ({
            index: index + 1,
            image: item.image,
            text: item.text,
            rating: state.ratings[index] || null,
            metadata: item.metadata || {}
        }));

        return JSON.stringify({
            metadata: {
                totalItems: state.data.length,
                ratedItems: state.getTotalRated(),
                startTime: state.startTime,
                completeTime: new Date().toISOString()
            },
            results: results
        }, null, 2);
    }

    static download(content, filename, mimeType) {
        const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8;` });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// ==================== 主应用 ====================
class RatingApp {
    constructor() {
        this.state = new RatingState();
        this.ui = null;
    }

    async init() {
        try {
            // 显示加载界面
            const tempUI = new UIManager(this.state);
            tempUI.showLoading();

            // 加载数据
            this.state.data = await DataLoader.loadData();

            // 尝试加载保存的进度
            const hasProgress = this.state.loadFromStorage();
            
            if (hasProgress) {
                const resume = confirm(
                    `检测到之前的进度（已完成 ${this.state.getTotalRated()} / ${this.state.data.length} 项）\n\n` +
                    `是否继续之前的进度？\n\n` +
                    `点击"确定"继续，点击"取消"重新开始`
                );
                
                if (!resume) {
                    this.state.currentIndex = 0;
                    this.state.ratings = [];
                    this.state.startTime = new Date().toISOString();
                }
            }

            // 初始化UI
            this.ui = new UIManager(this.state);
            this.ui.init();

        } catch (error) {
            console.error('初始化失败:', error);
            const tempUI = new UIManager(this.state);
            tempUI.showError(error);
        }
    }

    downloadCSV() {
        const csv = ExportManager.generateCSV(this.state);
        const filename = `rating_results_${Date.now()}.csv`;
        ExportManager.download(csv, filename, 'text/csv');
    }

    downloadJSON() {
        const json = ExportManager.generateJSON(this.state);
        const filename = `rating_results_${Date.now()}.json`;
        ExportManager.download(json, filename, 'application/json');
    }

    restart() {
        if (confirm('确定要重新开始吗？当前进度将被清除。')) {
            this.state.clearStorage();
            location.reload();
        }
    }
}

// ==================== 应用启动 ====================
let app;

window.addEventListener('load', () => {
    app = new RatingApp();
    app.init();
});