// ==================== 配置 ====================
const CONFIG = {
    dataFile: 'medical_data.json',  // 医学数据文件路径
    batchSize: 50
};

// ==================== 状态管理 ====================
class RatingState {
    constructor() {
        this.data = [];
        this.currentIndex = 0;
        this.currentImageIndex = 0;  // 当前显示的图片索引
        this.ratings = [];
        this.currentRating = null;
        this.startTime = new Date().toISOString();
        // 小数据库：记录每次评分（会覆盖同一 case 的记录）
        this.records = [];
    }

    // 记录或更新一项（按 index 唯一）
    setRecord(index, recordObj) {
        const existingIdx = this.records.findIndex(r => r.index === index);
        if (existingIdx >= 0) {
            this.records[existingIdx] = { ...this.records[existingIdx], ...recordObj };
        } else {
            this.records.push({ index, ...recordObj });
        }
    }

    getRecord(index) {
        return this.records.find(r => r.index === index);
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

    getCurrentImages() {
        if (this.currentIndex < this.data.length) {
            return this.data[this.currentIndex].image_paths || [];
        }
        return [];
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
                if (!item.image_paths || !Array.isArray(item.image_paths)) {
                    throw new Error(`数据项 ${index} 的 image_paths 应该是数组`);
                }
                if (!item.prompt) {
                    throw new Error(`数据项 ${index} 缺少 prompt 字段`);
                }
            });

            return data;
        } catch (error) {
            console.error('加载数据失败:', error);
            throw error;
        }
    }

    // 将路径转换为页面可用 URL，并把形如 "images/38865572_full_text_figure_10.jpg"
    // 转换为 "images/38865572/full_text_figure_10.jpg"
    static convertPath(rawPath) {
        // 如果已经是 URL，直接返回
        if (typeof rawPath !== 'string') return rawPath;
        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
            return rawPath;
        }

        // 取出文件名（去掉可能的目录）
        const filename = rawPath.split('\\').pop().split('/').pop();

        // 尝试匹配以数字开头，后接下划线的模式： "<digits>_<rest>"
        const m = filename.match(/^(\d+)[_\-](.+)$/);
        if (m) {
            const id = m[1];
            const rest = m[2];
            return `images/${id}/${rest}`;
        }

        // 如果不匹配上述模式，就按原始 filename 放在 images 目录下
        return `images/${filename}`;
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
            imageCount: document.getElementById('imageCount'),
            currentImageIndex: document.getElementById('currentImageIndex'),
            totalImages: document.getElementById('totalImages'),
            prevImageBtn: document.getElementById('prevImageBtn'),
            nextImageBtn: document.getElementById('nextImageBtn'),
            thumbnailContainer: document.getElementById('thumbnailContainer'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            downloadBtn: document.getElementById('downloadBtn'),
            mainContent: document.getElementById('mainContent'),
            ratingButtons: document.querySelectorAll('.rating-btn')
        };

        if (this.elements.nextBtn && this.elements.prevBtn) {
            this.bindEvents();
        }
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
        this.elements.downloadBtn.addEventListener('click', () => {
            if (app) app.downloadCSV();
        });

        // 图片导航按钮
        this.elements.prevImageBtn.addEventListener('click', () => this.prevImage());
        this.elements.nextImageBtn.addEventListener('click', () => this.nextImage());

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '4') {
                this.selectRating(parseInt(e.key));
            } else if (e.key === 'ArrowLeft' && !this.elements.prevBtn.disabled) {
                this.prevPair();
            } else if (e.key === 'ArrowRight' && !this.elements.nextBtn.disabled) {
                this.nextPair();
            } else if (e.key === 'a' || e.key === 'A') {
                this.prevImage();
            } else if (e.key === 'd' || e.key === 'D') {
                this.nextImage();
            }
        });
    }

    displayCurrentPair() {
        if (this.state.currentIndex < this.state.data.length) {
            const item = this.state.data[this.state.currentIndex];
            
            // 重置图片索引
            this.state.currentImageIndex = 0;
            
            // 显示图片
            this.displayImages(item.image_paths);
            
            // 显示文本
            this.elements.displayText.textContent = item.prompt;
            
            // 更新索引显示
            this.elements.currentIndex.textContent = this.state.currentIndex + 1;
            
            // 更新图片数量显示
            this.elements.imageCount.textContent = `(共 ${item.image_paths.length} 张)`;
            
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

    displayImages(imagePaths) {
        if (!imagePaths || imagePaths.length === 0) {
            this.elements.displayImage.src = '';
            this.elements.displayImage.alt = '无图片';
            return;
        }

        // 显示当前图片
        const currentPath = DataLoader.convertPath(imagePaths[this.state.currentImageIndex]);
        this.elements.displayImage.src = currentPath;
        this.elements.displayImage.alt = `图片 ${this.state.currentImageIndex + 1}`;

        // 更新图片导航
        this.elements.currentImageIndex.textContent = this.state.currentImageIndex + 1;
        this.elements.totalImages.textContent = imagePaths.length;
        this.elements.prevImageBtn.disabled = this.state.currentImageIndex === 0;
        this.elements.nextImageBtn.disabled = this.state.currentImageIndex === imagePaths.length - 1;

        // 显示/隐藏导航按钮
        const navigation = document.getElementById('imageNavigation');
        if (imagePaths.length > 1) {
            navigation.style.display = 'flex';
            this.displayThumbnails(imagePaths);
        } else {
            navigation.style.display = 'none';
            this.elements.thumbnailContainer.innerHTML = '';
        }
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

    selectRating(score, saveRecord = true) {
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
        
        // 保存评分到内存（不再使用 localStorage）
        this.state.setRating(this.state.currentIndex, score);

        if (saveRecord) {
            const item = this.state.data[this.state.currentIndex];
            const convertedPaths = (item.image_paths || []).map(p => DataLoader.convertPath(p));
            this.state.setRecord(this.state.currentIndex, {
                caseIndex: this.state.currentIndex + 1,
                prompt: item.prompt,
                image_paths: convertedPaths,
                rating: score,
                timestamp: new Date().toISOString()
            });
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
                <h2>正在加载医学数据...</h2>
                <p>请稍候</p>
            </div>
        `;
    }

    showError(error) {
        this.elements.mainContent.innerHTML = `
            <div class="error-message">
                <h2>❌ 加载失败</h2>
                <p>${error.message}</p>
                <p>请确保 medical_data.json 文件存在且格式正确</p>
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
                <p>您已完成 ${rated} / ${total} 个医学病例的评分</p>
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
    static generateCSVFromRecords(records) {
        // 填表头
        let csv = 'CaseIndex,Prompt,Image_Paths,Rating,Timestamp\n';
        // 记录按 caseIndex 升序
        const sorted = records.slice().sort((a,b) => a.caseIndex - b.caseIndex);
        sorted.forEach(r => {
            const imagePaths = (r.image_paths || []).join(';');
            const prompt = (r.prompt || '').replace(/"/g, '""');
            const rating = r.rating !== undefined ? r.rating : '';
            const ts = r.timestamp || '';
            csv += `${r.caseIndex},"${prompt}","${imagePaths}",${rating},${ts}\n`;
        });
        return csv;
    }

    static generateJSONFromRecords(records, state) {
        return JSON.stringify({
            metadata: {
                totalItems: state.data.length,
                recordedItems: records.length,
                startTime: state.startTime,
                exportTime: new Date().toISOString()
            },
            results: records
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
        const mainContent = document.getElementById('mainContent');
        // 保存原始HTML
        const originalHTML = mainContent ? mainContent.innerHTML : '';
        
        try {
            // 显示加载界面
            if (mainContent) {
                mainContent.innerHTML = `
                    <div class="loading-message">
                        <h2>正在加载医学数据...</h2>
                        <p>请稍候</p>
                    </div>
                `;
            }

            // 加载数据
            this.state.data = await DataLoader.loadData();

            // 恢复原始HTML内容
            if (mainContent && originalHTML) {
                mainContent.innerHTML = originalHTML;
            }

            // 初始化UI
            this.ui = new UIManager(this.state);
            this.ui.init();

        } catch (error) {
            console.error('初始化失败:', error);
            // 直接显示错误，不创建新的UIManager
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

    // 以 CSV 下载当前 records（如果没有记录，则仍然会生成空 CSV）
    downloadCSV() {
        const csv = ExportManager.generateCSVFromRecords(this.state.records);
        const filename = `medical_rating_records_${Date.now()}.csv`;
        ExportManager.download(csv, filename, 'text/csv');
    }

    downloadJSON() {
        const json = ExportManager.generateJSONFromRecords(this.state.records, this.state);
        const filename = `medical_rating_records_${Date.now()}.json`;
        ExportManager.download(json, filename, 'application/json');
    }

    restart() {
        if (confirm('确定要重新开始吗？当前内存中的记录将被清除。')) {
            // 只清空内存记录并 reload 页面以重置状态
            this.state.records = [];
            this.state.ratings = [];
            this.state.currentIndex = 0;
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
