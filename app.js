const CONFIG = { dataFile: 'medical_data.json' };
class RatingState {
    constructor() {
        this.data = [];
        this.currentIndex = 0;
        this.currentImageIndex = 0;
        this.ratings = [];
        this.startTime = new Date().toISOString();
    }
    save() {
        localStorage.setItem('ratingState', JSON.stringify({
            ratings: this.ratings, currentIndex: this.currentIndex
        }));
    }
    load() {
        const saved = localStorage.getItem('ratingState');
        if (saved) {
            const d = JSON.parse(saved);
            this.ratings = d.ratings || [];
            this.currentIndex = d.currentIndex || 0;
        }
    }
    setRating(i, s) { this.ratings[i] = s; this.save(); }
    getRating(i) { return this.ratings[i]; }
    hasRating(i) { return this.ratings[i] !== undefined; }
    getTotalRated() { return this.ratings.filter(r=>r!==undefined).length; }
    isComplete() { return this.currentIndex >= this.data.length; }
}
class DataLoader {
    static async loadData() {
        const r = await fetch(CONFIG.dataFile);
        const d = await r.json();
        if (!Array.isArray(d)) throw new Error('数据格式错误');
        return d;
    }
}
class UIManager {
    constructor(state) {
        this.state = state;
        this.el = {
            displayImage: document.getElementById('displayImage'),
            displayText: document.getElementById('displayText'),
            currentIndex: document.getElementById('currentIndex'),
            totalItems: document.getElementById('totalItems'),
            progressFill: document.getElementById('progressFill'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            ratingButtons: document.querySelectorAll('.rating-btn'),
            caseProgressContainer: document.getElementById('caseProgressContainer'),
            downloadCsvBtn: document.getElementById('downloadCsvBtn')
        };
        this.bind();
    }
    bind() {
        this.el.ratingButtons.forEach(b=>b.addEventListener('click',()=>this.selectRating(parseInt(b.dataset.score))));
        this.el.prevBtn.addEventListener('click',()=>this.prevPair());
        this.el.nextBtn.addEventListener('click',()=>this.nextPair());
        this.el.downloadCsvBtn.addEventListener('click',()=>app.downloadCSV());
        document.addEventListener('keydown',e=>{if(e.key>='1'&&e.key<='4')this.selectRating(parseInt(e.key));});
    }
    renderProgressBar() {
        const c=this.el.caseProgressContainer;
        c.innerHTML='';
        this.state.data.forEach((_,i)=>{
            const div=document.createElement('div');
            div.className='case-progress-item';
            div.textContent=i+1;
            if(this.state.hasRating(i))div.classList.add('rated');
            if(i===this.state.currentIndex)div.classList.add('active');
            div.addEventListener('click',()=>{this.state.currentIndex=i;this.displayCurrentPair();});
            c.appendChild(div);
        });
    }
    displayCurrentPair() {
        const item=this.state.data[this.state.currentIndex];
        this.el.displayImage.src=item.image_paths[0];
        this.el.displayText.textContent=item.prompt;
        this.el.currentIndex.textContent=this.state.currentIndex+1;
        this.el.totalItems.textContent=this.state.data.length;
        this.updateProgress();
        this.renderProgressBar();
        this.clearRatingSelection();
        if(this.state.hasRating(this.state.currentIndex))this.selectRating(this.state.getRating(this.state.currentIndex),false);
    }
    selectRating(score,save=true){
        this.el.ratingButtons.forEach(b=>b.classList.remove('selected'));
        const btn=[...this.el.ratingButtons].find(b=>parseInt(b.dataset.score)===score);
        if(btn)btn.classList.add('selected');
        if(save){this.state.setRating(this.state.currentIndex,score);this.renderProgressBar();}
        this.el.nextBtn.disabled=false;
    }
    clearRatingSelection(){this.el.ratingButtons.forEach(b=>b.classList.remove('selected'));this.el.nextBtn.disabled=true;}
    nextPair(){if(this.state.currentIndex<this.state.data.length-1){this.state.currentIndex++;this.state.save();this.displayCurrentPair();}}
    prevPair(){if(this.state.currentIndex>0){this.state.currentIndex--;this.state.save();this.displayCurrentPair();}}
    updateProgress(){const p=(this.state.getTotalRated()/this.state.data.length)*100;this.el.progressFill.style.width=`${p}%`;}
}
class RatingApp{
    constructor(){this.state=new RatingState();this.ui=null;}
    async init(){this.state.load();this.state.data=await DataLoader.loadData();this.ui=new UIManager(this.state);this.ui.displayCurrentPair();}
    downloadCSV(){
        const rows=[['Index','Prompt','Image_Paths','Rating']];
        this.state.data.forEach((item,i)=>{
            const r=this.state.getRating(i)||'';
            rows.push([i+1,`"${item.prompt.replace(/"/g,'""')}"`,
                       `"${
item.image_paths.join(';')}"`,r]);
        });
        const csv=rows.map(r=>r.join(',')).join('\n');
        const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
        const link=document.createElement('a');
        link.href=URL.createObjectURL(blob);
        link.download=`ratings_${Date.now()}.csv`;
        document.body.appendChild(link);link.click();link.remove();
    }
}
let app;window.addEventListener('load',()=>{app=new RatingApp();app.init();});
