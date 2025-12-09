import React, { useState, useRef } from 'react';
import { Button } from './components/Button';
import { VideoFile, AppState, ProcessingProgress } from './types';
import { stitchVideos } from './utils/videoProcessor';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [videoFiles, setVideoFiles] = useState<VideoFile[]>([]);
  const [progress, setProgress] = useState<ProcessingProgress>({ currentClipIndex: 0, totalClips: 0, statusMessage: '' });
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFolderUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const firstFile = files[0];
    if (firstFile.webkitRelativePath) {
      const parts = firstFile.webkitRelativePath.split('/');
      if (parts.length > 0) {
        setFolderName(parts[0]);
      }
    }

    const videoList: VideoFile[] = [];
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

    (Array.from(files) as File[]).forEach((file) => {
      if (validTypes.includes(file.type) || file.name.match(/\.(mp4|mov|webm|mkv)$/i)) {
        videoList.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          duration: 0,
          name: file.name
        });
      }
    });

    if (videoList.length === 0) {
      setErrorMsg("ไม่พบไฟล์วิดีโอในโฟลเดอร์ที่เลือก");
      return;
    }

    videoList.sort((a, b) => a.name.localeCompare(b.name));
    setVideoFiles(videoList);
    setAppState(AppState.IDLE);
  };

  const handleStartProcessing = async () => {
    if (videoFiles.length === 0) return;

    setAppState(AppState.PROCESSING);
    setErrorMsg(null);
    
    try {
      const blob = await stitchVideos(videoFiles, (p) => setProgress(p));
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultUrl(url);
      setAppState(AppState.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setErrorMsg("เกิดข้อผิดพลาดในการรวมคลิป: " + (err.message || 'Unknown error'));
      setAppState(AppState.ERROR);
    }
  };

  const handleDownload = () => {
    if (!resultUrl || !resultBlob) return;
    
    const a = document.createElement('a');
    a.href = resultUrl;
    
    const isMp4 = resultBlob.type.includes('mp4');
    const extension = isMp4 ? 'mp4' : 'webm';

    const fileName = folderName || `stitched_video_${Date.now()}`;
    
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetApp = () => {
    videoFiles.forEach(v => URL.revokeObjectURL(v.previewUrl));
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setVideoFiles([]);
    setAppState(AppState.IDLE);
    setResultBlob(null);
    setResultUrl(null);
    setFolderName(null);
    setProgress({ currentClipIndex: 0, totalClips: 0, statusMessage: '' });
  };

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 max-w-4xl mx-auto">
      <header className="w-full mb-10 text-center">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent mb-2">
          ClipStitch
        </h1>
        <p className="text-slate-400">รวมวิดีโอคลิปของคุณได้ง่ายๆ แบบ Offline ปลอดภัย 100%</p>
      </header>

      <main className="w-full flex-1 flex flex-col gap-8">
        
        {/* Step 1: Upload */}
        {appState === AppState.IDLE && videoFiles.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-3xl p-10 bg-slate-800/30 hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-blue-500 mb-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-2xl font-semibold mb-2">อัปโหลดโฟลเดอร์</h2>
            <p className="text-slate-400 text-center mb-6 max-w-md">
              เลือกโฟลเดอร์ที่มีคลิปวิดีโอ (เช่น .mp4, .mov) ระบบจะนำเข้าคลิปทั้งหมดเพื่อทำการรวมเป็นไฟล์เดียว
            </p>
            
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              // @ts-ignore
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderUpload}
            />
            
            <Button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              เลือกโฟลเดอร์จากคอมพิวเตอร์
            </Button>
            {errorMsg && <p className="mt-4 text-red-400 bg-red-900/20 px-4 py-2 rounded-lg">{errorMsg}</p>}
          </div>
        )}

        {/* Step 2: Review List */}
        {videoFiles.length > 0 && appState === AppState.IDLE && (
          <div className="w-full bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <span className="bg-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm">1</span>
                  คลิปที่พบ ({videoFiles.length}) {folderName && <span className="text-sm font-normal text-slate-400 ml-2">(จาก: {folderName})</span>}
                </h2>
                <Button variant="ghost" onClick={resetApp} className="text-sm">ยกเลิก / เริ่มใหม่</Button>
             </div>

             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-h-[400px] overflow-y-auto pr-2">
               {videoFiles.map((v, idx) => (
                 <div key={v.id} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700 relative group">
                    <div className="aspect-video bg-black relative">
                      <video src={v.previewUrl} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-xs font-mono">
                        #{idx + 1}
                      </div>
                    </div>
                    <div className="p-2">
                      <p className="text-xs truncate text-slate-300" title={v.name}>{v.name}</p>
                    </div>
                 </div>
               ))}
             </div>

             <div className="flex justify-end pt-4 border-t border-slate-700">
               <Button onClick={handleStartProcessing} className="w-full md:w-auto">
                 เริ่มการรวมวิดีโอ
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                   <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                 </svg>
               </Button>
             </div>
          </div>
        )}

        {/* Step 3: Processing */}
        {appState === AppState.PROCESSING && (
           <div className="flex-1 flex flex-col items-center justify-center p-12">
              <div className="w-24 h-24 relative mb-6">
                <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <h2 className="text-2xl font-bold mb-2">กำลังรวมคลิปวิดีโอ</h2>
              <p className="text-blue-400 mb-6 animate-pulse">{progress.statusMessage}</p>
              
              <div className="w-full max-w-md h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${(progress.currentClipIndex / progress.totalClips) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 mt-4 text-center">ระบบกำลังประมวลผลบนเบราว์เซอร์ของคุณ<br/>ความเร็วขึ้นอยู่กับความแรงของเครื่องคอมพิวเตอร์</p>
           </div>
        )}

        {/* Step 4: Result */}
        {appState === AppState.COMPLETED && resultUrl && (
          <div className="w-full animate-fade-in max-w-3xl mx-auto">
             <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 shadow-xl">
               <div className="text-center mb-6">
                 <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-900/50 text-green-400 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                 </div>
                 <h3 className="text-xl font-bold text-white">รวมคลิปเรียบร้อยแล้ว!</h3>
               </div>
               
               <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl mb-8 border border-slate-700">
                 <video src={resultUrl} controls className="w-full h-full" />
               </div>
               
               <div className="flex flex-col sm:flex-row gap-4 justify-center">
                 <Button onClick={handleDownload} className="flex-1 max-w-sm text-lg py-4 bg-green-600 hover:bg-green-500 shadow-green-900/30">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    ดาวน์โหลด ({folderName || 'Video'})
                 </Button>
               </div>
               
               <div className="mt-6 text-center">
                 <button onClick={resetApp} className="text-slate-500 hover:text-white text-sm underline underline-offset-4 transition-colors">
                    ทำรายการอื่นต่อ
                 </button>
               </div>
             </div>
          </div>
        )}
        
        {appState === AppState.ERROR && (
           <div className="text-center p-12 bg-red-900/10 rounded-2xl border border-red-900/50">
             <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-900/30 text-red-500 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
             </div>
             <h2 className="text-2xl font-bold text-white mb-2">เกิดข้อผิดพลาด</h2>
             <p className="text-slate-300 mb-6 max-w-md mx-auto">{errorMsg}</p>
             <Button onClick={resetApp} variant="secondary">ลองใหม่อีกครั้ง</Button>
           </div>
        )}

      </main>
      
      <footer className="w-full py-6 text-center text-slate-600 text-sm mt-8 border-t border-slate-800/50">
        <p>ClipStitch - Secure Browser-based Video Processing</p>
      </footer>
    </div>
  );
};

export default App;