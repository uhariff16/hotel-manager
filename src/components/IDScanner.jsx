import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { getGuestIdSignedUrl } from '../lib/guestIdStorage';
import toast from 'react-hot-toast';
import { Camera as CameraIcon, Upload, Loader2, FileText, CheckCircle2 } from 'lucide-react';

const IDScanner = React.forwardRef(({ side, onScanComplete, existingUrl, tenantId }, ref) => {
  React.useImperativeHandle(ref, () => ({
    triggerScan: () => {
      if (Capacitor.isNativePlatform()) {
        handleMobileCapture();
      } else {
        document.getElementById(`file-upload-${side}`)?.click();
      }
    }
  }));
  const [isScanning, setIsScanning] = useState(false);
  const [preview, setPreview] = useState('');
  const activeObjectUrlRef = React.useRef(null);

  // Revoke any created object URL on component unmount to prevent memory leaks
  React.useEffect(() => {
    return () => {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  // Dynamically resolve on-demand ephemeral signed URL (5 minutes) for existingUrl
  React.useEffect(() => {
    let isMounted = true;
    if (!existingUrl) {
      if (!activeObjectUrlRef.current) {
        setPreview('');
      }
      return;
    }
    // Local blob or data URL directly from current scan
    if (existingUrl.startsWith('blob:') || existingUrl.startsWith('data:')) {
      setPreview(existingUrl);
      return;
    }
    // Storage path or legacy signed URL: request short-lived preview URL
    getGuestIdSignedUrl(existingUrl, 300).then(signedUrl => {
      if (isMounted && signedUrl) {
        setPreview(signedUrl);
      }
    });
    return () => { isMounted = false; };
  }, [existingUrl]);

  const processImage = async (fileOrBase64, isWebFile = false) => {
    setIsScanning(true);
    let imageUrl = '';
    let fileToUpload = null;

    try {
      if (isWebFile) {
        // Enforce 10MB pre-compression sanity check
        if (fileOrBase64.size > 10 * 1024 * 1024) {
          toast.error('Selected image is too large. Please select an image under 10MB.');
          setIsScanning(false);
          return;
        }
        fileToUpload = fileOrBase64;
      } else {
        // Base64 from Capacitor
        const response = await fetch(`data:image/jpeg;base64,${fileOrBase64}`);
        fileToUpload = await response.blob();
      }

      // Revoke any previous preview object URL to prevent memory accumulation on retakes
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }

      imageUrl = URL.createObjectURL(fileToUpload);
      activeObjectUrlRef.current = imageUrl;
      setPreview(imageUrl);

      // DEFERRED UPLOAD ARCHITECTURE (Stage 5H.9J):
      // Do NOT upload to Supabase Storage immediately upon capture.
      // The image blob is held in browser memory for preview and passed to onScanComplete.
      // Storage upload only occurs upon final booking confirmation/submission.
      toast.success('Image Captured!', { id: `capture-${side}`, duration: 2500 });
      
      // Call AI Edge Function using memory base64
      toast.loading(`Analyzing ${side} with AI...`, { id: `ai-${side}` });
      
      // Convert blob to base64 for the Edge Function
      const base64Image = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(fileToUpload);
      });

      const { data: aiData, error: aiError } = await supabase.functions.invoke('process-id-image', {
        body: { base64Image, side }
      });
      
      if (aiError || aiData?.error) {
        const rawError = aiData?.error || aiError?.message || 'Unknown error';
        console.error("CRITICAL AI ERROR (For Super Admin):", rawError);
        
        if (rawError.includes('429') || rawError.includes('RESOURCE_EXHAUSTED') || rawError.includes('503') || rawError.includes('overloaded')) {
          toast.error('Smart Scan is currently busy. Please fill details manually or try again in a minute.', { id: `ai-${side}`, duration: 4000 });
        } else {
          toast.error('Smart Scan could not read this image clearly. Please enter details manually.', { id: `ai-${side}`, duration: 4000 });
        }
        
        onScanComplete({ side, file: fileToUpload, previewUrl: imageUrl, url: imageUrl, text: '', aiData: null, isNewUpload: true });
      } else {
        toast.success('AI Data Extracted!', { id: `ai-${side}` });
        onScanComplete({ side, file: fileToUpload, previewUrl: imageUrl, url: imageUrl, text: '', aiData, isNewUpload: true });
      }
      
    } catch (err) {
      console.error(err);
      toast.error('Failed to process image');
      toast.dismiss(`ocr-${side}`);
      toast.dismiss(`capture-${side}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleMobileCapture = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 60,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        width: 1200
      });
      if (image.base64String) {
        await processImage(image.base64String, false);
      }
    } catch (err) {
      console.log('Camera cancelled or failed', err);
    }
  };

  const handleWebUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Basic HTML5 Canvas Compression
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1200;
        
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        const canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        
        const targetBytes = 200 * 1024; // 200 KB
        let quality = 0.8;
        
        const attemptCompression = () => {
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob.size > targetBytes && quality > 0.1) {
              quality -= 0.1;
              attemptCompression();
            } else if (blob.size > targetBytes && quality <= 0.1) {
              // Image is still too large at lowest quality, shrink dimensions
              width = Math.round(width * 0.8);
              height = Math.round(height * 0.8);
              quality = 0.6; // reset quality slightly for new dimensions
              attemptCompression();
            } else {
              processImage(blob, true);
            }
          }, 'image/jpeg', quality);
        };
        
        attemptCompression();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenPreview = async (e) => {
    e.preventDefault();
    if (!existingUrl && !preview) return;
    if (preview && (preview.startsWith('blob:') || preview.startsWith('data:'))) {
      window.open(preview, '_blank', 'noopener,noreferrer');
      return;
    }
    const target = existingUrl || preview;
    const freshSignedUrl = await getGuestIdSignedUrl(target, 300);
    if (freshSignedUrl) {
      setPreview(freshSignedUrl);
      window.open(freshSignedUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast.error('Unable to view document. Permission denied or file not found.');
    }
  };

  return (
    <div style={{ border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', position: 'relative', overflow: 'hidden' }}>
      {preview ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <a href={preview} onClick={handleOpenPreview} target="_blank" rel="noopener noreferrer" style={{ display: 'block', position: 'relative', width: '100%', height: '120px', borderRadius: '4px', overflow: 'hidden', cursor: 'zoom-in' }}>
            <img src={preview} alt={`${side} ID`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
              <CheckCircle2 color="#4ade80" size={32} />
            </div>
          </a>
          <button 
            type="button" 
            className="btn-danger" 
            style={{ width: '100%', fontSize: '0.8rem', padding: '0.4rem' }}
            onClick={(e) => {
              e.stopPropagation();
              if (activeObjectUrlRef.current) {
                URL.revokeObjectURL(activeObjectUrlRef.current);
                activeObjectUrlRef.current = null;
              }
              setPreview('');
              onScanComplete({ side, file: null, previewUrl: '', url: '', text: '', aiData: null, isCleared: true });
            }}
          >
            Clear Image
          </button>
        </div>
      ) : (
        <FileText size={32} color="var(--text-muted)" />
      )}
      
      <div style={{ fontSize: '0.9rem', fontWeight: '500', color: 'var(--text-main)' }}>
        {side === 'front' ? 'Front of ID' : 'Back of ID'}
      </div>

      {isScanning ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
          <Loader2 size={16} className="spin" />
          <span style={{ fontSize: '0.85rem' }}>Processing...</span>
        </div>
      ) : (
        <>
          {Capacitor.isNativePlatform() ? (
            <button type="button" onClick={handleMobileCapture} className="btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }}>
              <CameraIcon size={16} style={{ marginRight: '0.5rem' }} />
              Capture / Gallery
            </button>
          ) : (
            <div style={{ position: 'relative', width: '100%' }}>
              <button type="button" className="btn-secondary" style={{ width: '100%', fontSize: '0.85rem' }}>
                <Upload size={16} style={{ marginRight: '0.5rem' }} />
                Upload File
              </button>
              <input 
                id={`file-upload-${side}`}
                type="file" 
                accept="image/*" 
                onChange={handleWebUpload}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
});

export default IDScanner;
