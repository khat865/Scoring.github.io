// ==================== 配置 ====================
const CONFIG = {
    dataFile: 'medical_data.json',
    storageKey: 'medicalRatingProgress',
    batchSize: 50,
    // Google Sheets 云存储配置
    cloudSync: {
        enabled: true,  // 启用云同步
        scriptUrl: 'https://script.google.com/macros/s/AKfycbw8BDjfd1yoEzStjbTPhzVbzztC0Leo1kleHTI-upUQne4xJMWVmbgkHckMBsSMk53U/exec',  // 从 Apps Script 部署后复制
        autoSync: true  // 每次评分后自动同步
    }
};

// ==================== 云存储管理器 ====================
class CloudStorage {
    constructor(config) {
        this.enabled = config.enabled;
        this.scriptUrl = config.scriptUrl;
        this.autoSync = config.autoSync;
    }

    async syncRating(caseIndex, score, prompt) {
        if (!this.enabled || !this.scriptUrl || this.scriptUrl === '在这里粘贴你的 Apps Script URL') {
            console.log('云同步未配置');
            return false;
        }

        try {
            const userId = this.getUserId();
            const data = {
                userId: userId,
                caseIndex: caseIndex + 1,
                score: score,
                timestamp: new Date().toISOString(),
                prompt: prompt.substring(0, 100)
            };

            const response = await fetch(this.scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });

            console.log('✓ 已同步到云端');
            return true;
        } catch (error) {
            console.error('云同步错误:', error);
            return false;
        }
    }

    getUserId() {
        let userId = localStorage.getItem('userId');
        if (!userId) {
            const randomName = prompt('请输入你的名字或ID（用于识别评分者）：', 'User_' + Math.random().toString(36).substr(2, 5));
            userId = randomName || 'User_' + Date.now();
            localStorage.setItem('userId', userId);
        }
        return userId;
    }
}

// ==================== 状态管理 ====================
class RatingState {
    constructor() {
        this.data = [];
        this.currentIndex = 0;
        this.currentImageIndex = 0;
        this.ratings = [];
        this.currentRating = null;
        this.startTime = null;
    }

    loadFromStorage() {
        try {
            const saved = localStorage.getItem(CONFIG.storageKey);
            if (!saved) return false;

            const data = JSON.parse(saved);
            this.currentIndex = data.currentIndex || 0;
            this.ratings = data.ratings || [];
            this.startTime = data.startTime || new Date().toISOString();
            
            return true;
        } catch (error) {
            console.error('加载进度失败:', error);
            return false;
        }
    }

    saveToStorage() {
        try {
            const data = {
                currentIndex: this.currentIndex,
                ratings: this.ratings,
                startTime: this.startTime,
                lastModified: new Date().toISOString()
            };
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
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
        this.ratings[index] = {
            score: score,
            timestamp: new Date().toISOString()
        };
    }

    getRating(index) {
        return this.ratings[index];
    }

    getCurrentPair() {
        return this.data[this.currentIndex];
    }

    getCurrentImages() {
        const pair = this.getCurrentPair();
        return pair ? pair.image_paths : [];
    }

    getTotalRated() {
        return this.ratings.filter(r => r !== null && r !== undefined).length;
    }

    isCompleted() {
        return this.currentIndex >= this.data.length;
    }
}

// ==================== 数据加载器 ====================
class DataLoader {
    static async loadData() {
        try {
            const response = await fetch(CONFIG.dataFile);
            if (!response.ok) {
                throw new Error(`HTTP错误! 状态: ${response.status}`);
            }
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('数据格式错误或为空');
            }
            
            return data;
        } catch (error) {
            console.error('加载数据失败:', error);
            throw new Error(`无法加载数据文件: ${error.message}`);
        }
    }

    static convertPath(windowsPath) {
        if (!windowsPath) return '';
        if (windowsPath.startsWith('http')) return windowsPath;
        if (windowsPath.startsWith('images/')) return windowsPath;
        
        const filename = windowsPath.split('\\').pop().split('/').pop();
        return `images/${filename}`;
    }
}

// ==================== UI管理器 ====================
class UIManager {
    constructor(state, cloudStorage) {
        this.state = state;
        this.cloudStorage = cloudStorage;
        
        this.elements = {
            displayImage: document.getElementById('displayImage'),
            displayText: document.getElementById('displayText'),
            currentIndex: document.getElementById('currentIndex'),
            totalItems: document.getElementById('totalItems'),
            progressFill: document.getElementById('progressFill'),
            imageCount: document.getElementById('imageCount'),
            currentImageIndex: document.getElementById('currentImageIndex'),
            totalImages: document.getElementById('totalImages'),
            prevImageBtn: document.getElementById('prevImageBtn'),
            nextImageBtn: document.getElementById('nextImageBtn'),
            thumbnailContainer: document.getElementById('thumbnailContainer'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            mainContent: document.getElementById('mainContent'),
            ratingButtons: document.querySelectorAll('.rating-btn'),
            caseProgressContainer: document.getElementById('caseProgressContainer'),
            downloadCsvBtn: document.getElementById('downloadCsvBtn')
        };

        if (this.elements.nextBtn && this.elements.prevBtn) {
            this.bindEvents();
        }
    }

    bindEvents() {
        this.elements.ratingButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectRating(parseInt(btn.dataset.score));
            });
        });

        this.elements.nextBtn.addEventListener('click', () => this.nextPair());
        this.elements.prevBtn.addEventListener('click', () => this.prevPair());

        this.elements.prevImageBtn.addEventListener('click', () => this.prevImage());
        this.elements.nextImageBtn.addEventListener('click', () => this.nextImage());

        if (this.elements.downloadCsvBtn) {
            this.elements.downloadCsvBtn.addEventListener('click', () => {
                window.app.downloadCSV();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                this.selectRating(parseInt(e.key));
            } else if (e.key === 'ArrowRight') {
                if (!this.elements.nextBtn.disabled) {
                    this.nextPair();
                }
            } else if (e.key === 'ArrowLeft') {
                if (!this.elements.prevBtn.disabled) {
                    this.prevPair();
                }
            }
        });
    }

    init() {
        if (this.state.isCompleted()) {
            this.showCompletion();
        } else {
            this.renderProgressBalls();
            this.render();
        }
    }

    renderProgressBalls() {
        if (!this.elements.caseProgressContainer) return;

        const totalCases = this.state.data.length;
        this.elements.caseProgressContainer.innerHTML = '';

        for (let i = 0; i < totalCases; i++) {
            const ball = document.createElement('div');
            ball.className = 'case-progress-item';
            ball.textContent = i + 1;
            ball.title = `病例 ${i + 1}`;

            if (this.state.getRating(i)) {
                ball.classList.add('rated');
            }

            if (i === this.state.currentIndex) {
                ball.classList.add('active');
                setTimeout(() => {
                    ball.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }, 100);
            }

            ball.addEventListener('click', () => {
                this.jumpToCase(i);
            });

            this.elements.caseProgressContainer.appendChild(ball);
        }
    }

    jumpToCase(targetIndex) {
        if (targetIndex < 0 || targetIndex >= this.state.data.length) return;

        this.state.currentIndex = targetIndex;
        this.state.currentImageIndex = 0;
        this.render();
    }

    render() {
        const pair = this.state.getCurrentPair();
        if (!pair) {
            this.showCompletion();
            return;
        }

        this.displayImages(pair.image_paths);

        if (this.elements.displayText) {
            this.elements.displayText.textContent = pair.prompt;
        }

        if (this.elements.currentIndex) {
            this.elements.currentIndex.textContent = this.state.currentIndex + 1;
        }
        if (this.elements.totalItems) {
            this.elements.totalItems.textContent = this.state.data.length;
        }

        this.updateProgress();
        this.renderProgressBalls();

        const savedRating = this.state.getRating(this.state.currentIndex);
        if (savedRating) {
            this.selectRating(savedRating.score, false);
        } else {
            this.clearRatingSelection();
        }

        this.elements.prevBtn.disabled = this.state.currentIndex === 0;
    }

    displayImages(imagePaths) {
        if (!imagePaths || imagePaths.length === 0) return;

        const currentImagePath = imagePaths[this.state.currentImageIndex];
        
        if (this.elements.displayImage) {
            this.elements.displayImage.src = DataLoader.convertPath(currentImagePath);
        }

        if (this.elements.imageCount) {
            this.elements.imageCount.textContent = `(${imagePaths.length}张)`;
        }

        if (this.elements.currentImageIndex) {
            this.elements.currentImageIndex.textContent = this.state.currentImageIndex + 1;
        }
        if (this.elements.totalImages) {
            this.elements.totalImages.textContent = imagePaths.length;
        }

        if (this.elements.prevImageBtn) {
            this.elements.prevImageBtn.disabled = this.state.currentImageIndex === 0;
        }
        if (this.elements.nextImageBtn) {
            this.elements.nextImageBtn.disabled = this.state.currentImageIndex === imagePaths.length - 1;
        }

        const showNav = imagePaths.length > 1;
        if (this.elements.imageNavigation) {
            this.elements.imageNavigation.style.display = showNav ? 'flex' : 'none';
        }

        this.displayThumbnails(imagePaths);
    }

    displayThumbnails(imagePaths) {
        this.elements.thumbnailContainer.innerHTML = '';
        
        if (imagePaths.length <= 1) return;

        imagePaths.forEach((path, index) => {
            const thumbnail = document.createElement('div');
            thumbnail.className = 'thumbnail';
            if (index === this.state.currentImageIndex) {
                thumbnail.classList.add('active');
            }

            const img = document.createElement('img');
            img.src = DataLoader.convertPath(path);
            img.alt = `缩略图 ${index + 1}`;
            
            thumbnail.appendChild(img);
            thumbnail.addEventListener('click', () => {
                this.state.currentImageIndex = index;
                this.displayImages(imagePaths);
            });

            this.elements.thumbnailContainer.appendChild(thumbnail);
        });
    }

    prevImage() {
        const images = this.state.getCurrentImages();
        if (this.state.currentImageIndex > 0) {
            this.state.currentImageIndex--;
            this.displayImages(images);
        }
    }

    nextImage() {
        const images = this.state.getCurrentImages();
        if (this.state.currentImageIndex < images.length - 1) {
            this.state.currentImageIndex++;
            this.displayImages(images);
        }
    }

    async selectRating(score, saveRating = true) {
        this.clearRatingSelection();
        
        const selectedBtn = Array.from(this.elements.ratingButtons)
            .find(btn => parseInt(btn.dataset.score) === score);
        if (selectedBtn) {
            selectedBtn.classList.add('selected');
        }
        
        this.state.currentRating = score;
        
        if (saveRating) {
            this.state.setRating(this.state.currentIndex, score);
            this.state.saveToStorage();
            
            // 云同步
            if (CONFIG.cloudSync.enabled && CONFIG.cloudSync.autoSync) {
                const pair = this.state.getCurrentPair();
                await this.cloudStorage.syncRating(this.state.currentIndex, score, pair.prompt);
            }
            
            this.renderProgressBalls();
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
        this.state.currentImageIndex = 0;
        
        if (this.state.isCompleted()) {
            this.showCompletion();
        } else {
            this.render();
        }
    }

    prevPair() {
        if (this.state.currentIndex > 0) {
            this.state.currentIndex--;
            this.state.currentImageIndex = 0;
            this.render();
        }
    }

    updateProgress() {
        const progress = (this.state.currentIndex / this.state.data.length) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
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

    showCompletion() {
        this.elements.mainContent.innerHTML = `
            <div class="completion-message">
                <h2>🎉 恭喜完成！</h2>
                <p>您已完成所有 ${this.state.data.length} 个病例的评分</p>
                <p>评分数量: ${this.state.getTotalRated()} / ${this.state.data.length}</p>
                <div class="action-buttons">
                    <button class="btn btn-success" onclick="app.downloadCSV()">下载CSV结果</button>
                    <button class="btn btn-info" onclick="app.downloadJSON()">下载JSON结果</button>
                    <button class="btn btn-secondary" onclick="app.restart()">重新开始</button>
                </div>
            </div>
        `;
    }
}

// ==================== 导出管理器 ====================
class ExportManager {
    static generateCSV(state) {
        const headers = ['序号', '评分', '评分时间', 'Prompt'];
        const rows = [headers];

        state.data.forEach((item, index) => {
            const rating = state.getRating(index);
            rows.push([
                index + 1,
                rating ? rating.score : '',
                rating ? rating.timestamp : '',
                item.prompt.replace(/"/g, '""')
            ]);
        });

        return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    }

    static generateJSON(state) {
        const results = state.data.map((item, index) => {
            const rating = state.getRating(index);
            return {
                index: index + 1,
                score: rating ? rating.score : null,
                timestamp: rating ? rating.timestamp : null,
                prompt: item.prompt,
                image_count: item.image_paths.length
            };
        });

        return JSON.stringify({
            metadata: {
                total_cases: state.data.length,
                completed: state.getTotalRated(),
                start_time: state.startTime,
                export_time: new Date().toISOString()
            },
            results: results
        }, null, 2);
    }

    static download(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ==================== 主应用 ====================
class RatingApp {
    constructor() {
        this.state = new RatingState();
        this.cloudStorage = new CloudStorage(CONFIG.cloudSync);
        this.ui = null;
    }

    async init() {
        const mainContent = document.getElementById('mainContent');
        const originalHTML = mainContent ? mainContent.innerHTML : '';
        
        try {
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="loading-message">
                        <h2>正在加载医学数据...</h2>
                        <p>请稍候</p>
                    </div>
                `;
            }

            this.state.data = await DataLoader.loadData();

            if (mainContent && originalHTML) {
                mainContent.innerHTML = originalHTML;
            }

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

            this.ui = new UIManager(this.state, this.cloudStorage);
            this.ui.init();

        } catch (error) {
            console.error('初始化失败:', error);
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="error-message">
                        <h2>❌ 加载失败</h2>
                        <p>${error.message}</p>
                        <p>请确保 medical_data.json 文件存在且格式正确</p>
                        <button class="btn btn-primary" onclick="location.reload()">重新加载</button>
                    </div>
                `;
            }
        }
    }

    downloadCSV() {
        const csv = ExportManager.generateCSV(this.state);
        const filename = `medical_rating_results_${Date.now()}.csv`;
        ExportManager.download(csv, filename, 'text/csv;charset=utf-8;');
        this.ui.showNotification('CSV文件已下载！', 'success');
    }

    downloadJSON() {
        const json = ExportManager.generateJSON(this.state);
        const filename = `medical_rating_results_${Date.now()}.json`;
        ExportManager.download(json, filename, 'application/json');
        this.ui.showNotification('JSON文件已下载！', 'success');
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