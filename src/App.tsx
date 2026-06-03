/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  FileText, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Pin, 
  BookOpen, 
  Database, 
  Filter, 
  Clock, 
  ArrowUpDown, 
  RotateCcw, 
  FileSpreadsheet, 
  FileCode, 
  Share2, 
  X, 
  ChevronDown, 
  ChevronUp, 
  SlidersHorizontal, 
  AlertCircle,
  HelpCircle,
  Info,
  Lock,
  Unlock,
  Laptop,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { DocumentLink, CategoryType } from './types';
import { INITIAL_DOCUMENTS } from './data/defaultDocuments';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { 
  onSnapshot, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  getDoc,
  increment 
} from 'firebase/firestore';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function App() {
  const [documents, setDocuments] = useState<DocumentLink[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // State Management
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('Semua');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'popular' | 'alpha'>('newest');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isGuidelineExpanded, setIsGuidelineExpanded] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  // Admin Mode States
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoginModalOpen, setIsAdminLoginModalOpen] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [isChangePinModalOpen, setIsChangePinModalOpen] = useState(false);
  const [currentPinInputForChange, setCurrentPinInputForChange] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [changePinError, setChangePinError] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Sync Documents in real-time from Firestore (Loads immediately regardless of auth)
  useEffect(() => {
    const unsubscribeDocs = onSnapshot(collection(db, 'documents'), (snapshot) => {
      const docsList: DocumentLink[] = [];
      snapshot.forEach((snapDoc) => {
        docsList.push(snapDoc.data() as DocumentLink);
      });

      if (docsList.length === 0) {
        // Fallback to local INITIAL_DOCUMENTS if DB is empty
        setDocuments(INITIAL_DOCUMENTS);
      } else {
        setDocuments(docsList);
      }
    }, (error) => {
      console.error("Firestore onSnapshot error:", error);
      // Fallback to local documents if Firebase is offline or loading is denied
      if (documents.length === 0) {
        setDocuments(INITIAL_DOCUMENTS);
      }
    });

    return () => {
      if (unsubscribeDocs) unsubscribeDocs();
    };
  }, []);

  // Bootstrap Admin Pin and Sync Session status in real-time
  useEffect(() => {
    const checkAndBootstrapAdminSetting = async () => {
      try {
        await setDoc(doc(db, 'settings', 'admin'), { adminPin: 'admin123' });
        console.log("Admin PIN bootstrapped to 'admin123' successfully.");
      } catch (e) {
        // Safe to ignore if it already exists or writing is denied
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthReady(true);
        setAuthError(null);
        await checkAndBootstrapAdminSetting();

        // Check if there is an active valid session for this browser session
        try {
          const sessionSnap = await getDoc(doc(db, 'sessions', user.uid));
          if (sessionSnap.exists() && sessionSnap.data()?.authorized === true) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
          }
        } catch (error) {
          setIsAdmin(false);
        }

        // Try to automatically seed database if it is empty and user is logged in
        try {
          if (documents.length === 0) {
            INITIAL_DOCUMENTS.forEach(async (d) => {
              try {
                await setDoc(doc(db, 'documents', d.id), d);
              } catch (err) {
                // Ignore seeding errors for write-protected clients
              }
            });
          }
        } catch (err) {
          // Ignore
        }

      } else {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          console.error("Anonymous authentication error", e);
          setAuthError(e.code || e.message || String(e));
        }
      }
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [documents.length]);

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError('');

    if (!auth.currentUser) {
      setChangePinError('Otentikasi belum siap. Silakan refresh halaman.');
      return;
    }

    if (!newPinInput.trim()) {
      setChangePinError('PIN baru tidak boleh kosong.');
      return;
    }

    if (newPinInput.length < 4) {
      setChangePinError('PIN baru minimal harus 4 karakter.');
      return;
    }

    if (newPinInput !== confirmNewPinInput) {
      setChangePinError('Konfirmasi PIN baru tidak sesuai.');
      return;
    }

    try {
      // Step 1: Verify current PIN by submitting it to current session
      const userSessionRef = doc(db, 'sessions', auth.currentUser.uid);
      await setDoc(userSessionRef, {
        pin: currentPinInputForChange,
        authorized: true
      });

      // Step 2: Session is authorized, now we can update the global settings PIN
      await setDoc(doc(db, 'settings', 'admin'), {
        adminPin: newPinInput
      });

      // Step 3: Refresh local session under the new PIN
      await setDoc(doc(db, 'sessions', auth.currentUser.uid), {
        pin: newPinInput,
        authorized: true
      });

      showToast('PIN Administrator berhasil diperbarui!', 'success');
      setIsChangePinModalOpen(false);

      // Reset fields
      setCurrentPinInputForChange('');
      setNewPinInput('');
      setConfirmNewPinInput('');
    } catch (error) {
      setChangePinError('Verifikasi PIN lama salah atau Anda tidak memiliki akses.');
    }
  };

  const handleVerifyLogin = async (enteredPin: string) => {
    setPinError('');
    
    let currentUser = auth.currentUser;
    if (!currentUser) {
      try {
        const userCredential = await signInAnonymously(auth);
        currentUser = userCredential.user;
      } catch (e: any) {
        console.error("Manual signInAnonymously failed", e);
        setPinError(`Koneksi autentikasi belum siap: ${e.code || e.message}. Mohon aktifkan provider 'Anonymous' di menu Authentication > Sign-in method di Firebase Console Anda.`);
        return;
      }
    }

    if (!currentUser) {
      setPinError('Otentikasi belum siap. Silakan refresh halaman atau periksa konfigurasi Firebase.');
      return;
    }

    try {
      const userSessionRef = doc(db, 'sessions', currentUser.uid);
      await setDoc(userSessionRef, {
        pin: enteredPin.trim(),
        authorized: true
      });
      setIsAdmin(true);
      setIsAdminLoginModalOpen(false);
      showToast('Berhasil masuk sebagai administrator!', 'success');
    } catch (e: any) {
      setPinError('PIN salah! Silakan coba lagi. Petunjuk: PIN standar bawaan adalah "admin123".');
    }
  };

  // Add Document Form State
  const [formTitle, setFormTitle] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formCategory, setFormCategory] = useState<Exclude<CategoryType, 'Semua'>>('Kurikulum');
  const [formDescription, setFormDescription] = useState('');
  const [formFileType, setFormFileType] = useState<DocumentLink['fileType']>('pdf');
  const [formUploader, setFormUploader] = useState('');
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formIsHidden, setFormIsHidden] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Real-time Indonesian Clock Effect
  useEffect(() => {
    const updateTime = () => {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
      };
      const formatted = new Date().toLocaleDateString('id-ID', options);
      setCurrentTime(formatted + ' WIB');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  // Document Management Actions
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: { [key: string]: string } = {};

    if (!formTitle.trim()) errors.title = 'Judul dokumen wajib diisi.';
    if (!formUrl.trim()) {
      errors.url = 'Link/tautan dokumen wajib diisi.';
    } else if (!formUrl.startsWith('http://') && !formUrl.startsWith('https://')) {
      errors.url = 'Link harus dimulai dengan http:// atau https://';
    }
    if (!formUploader.trim()) errors.uploader = 'Bagian/Pengunggah wajib diisi.';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast('Harap lengkapi formulir dengan benar.', 'error');
      return;
    }

    const docId = `doc-${Date.now()}`;
    const newDoc: DocumentLink = {
      id: docId,
      title: formTitle.trim(),
      url: formUrl.trim(),
      category: formCategory,
      description: formDescription.trim() || 'Tidak ada deskripsi tambahan.',
      fileType: formFileType,
      dateAdded: new Date().toISOString().split('T')[0],
      uploader: formUploader.trim(),
      isPinned: formIsPinned,
      isHidden: formIsHidden,
      clicks: 0
    };

    try {
      await setDoc(doc(db, 'documents', docId), newDoc);
      showToast(`Dokumen "${formTitle}" berhasil ditambahkan!`, 'success');
      setIsModalOpen(false);
      
      // Reset Form
      setFormTitle('');
      setFormUrl('');
      setFormCategory('Kurikulum');
      setFormDescription('');
      setFormFileType('pdf');
      setFormUploader('');
      setFormIsPinned(false);
      setFormIsHidden(false);
      setFormErrors({});
    } catch (error) {
      showToast('Gagal menambahkan dokumen ke server.', 'error');
      handleFirestoreError(error, OperationType.CREATE, `documents/${docId}`);
    }
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    if (window.confirm(`Apakah Anda yakin ingin menghapus dokumen "${title}"?`)) {
      try {
        await deleteDoc(doc(db, 'documents', id));
        showToast('Dokumen berhasil dihapus.', 'info');
      } catch (error) {
        showToast('Gagal menghapus dokumen dari server.', 'error');
        handleFirestoreError(error, OperationType.DELETE, `documents/${id}`);
      }
    }
  };

  const handleTogglePin = async (id: string, currentPinStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'documents', id), {
        isPinned: !currentPinStatus
      });
      showToast(
        currentPinStatus ? 'Pin dokumen dilepas.' : 'Dokumen berhasil disematkan di atas.',
        'success'
      );
    } catch (error) {
      showToast('Gagal merubah status pin dokumen.', 'error');
      handleFirestoreError(error, OperationType.UPDATE, `documents/${id}`);
    }
  };

  const handleToggleVisibility = async (id: string, currentHiddenStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'documents', id), {
        isHidden: !currentHiddenStatus
      });
      showToast(
        currentHiddenStatus ? 'Dokumen sekarang ditampilkan ke Publik.' : 'Dokumen berhasil disembunyikan dari Publik.',
        'success'
      );
    } catch (error) {
      showToast('Gagal merubah visibilitas dokumen.', 'error');
      handleFirestoreError(error, OperationType.UPDATE, `documents/${id}`);
    }
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => {
        showToast('Tautan berhasil disalin ke papan klip!', 'success');
      },
      () => {
        showToast('Gagal menyalin tautan.', 'error');
      }
    );
  };

  const handleRecordClick = async (id: string, url: string) => {
    try {
      await updateDoc(doc(db, 'documents', id), {
        clicks: increment(1)
      });
    } catch (error) {
      console.error("Gagal mencatat hit klik:", error);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleResetData = async () => {
    if (window.confirm('Apakah Anda ingin memulihkan semua dokumen bawaan sistem? Tindakan ini akan mengembalikan berkas-berkas bawaan MAN 1 Tasikmalaya.')) {
      try {
        // Delete existing docs from database
        for (const docItem of documents) {
          await deleteDoc(doc(db, 'documents', docItem.id));
        }
        // Repopulate with INITIAL_DOCUMENTS
        for (const docItem of INITIAL_DOCUMENTS) {
          await setDoc(doc(db, 'documents', docItem.id), docItem);
        }
        showToast('Database dokumen berhasil dipulihkan.', 'success');
      } catch (error) {
        showToast('Gagal memulihkan database dokumen.', 'error');
        handleFirestoreError(error, OperationType.WRITE, 'documents (bulk)');
      }
    }
  };

  // Filter Categories list
  const categories: CategoryType[] = [
    'Semua',
    'Kurikulum',
    'Kesiswaan',
    'Humas & Kerjasama',
    'Sarana Prasarana',
    'Tata Usaha & Kepegawaian',
    'SK & Surat Tugas',
    'Formulir Digital',
    'Lainnya'
  ];

  // Computed and filtered list
  const filteredDocuments = useMemo(() => {
    return documents
      .filter((doc) => {
        const matchesCategory = selectedCategory === 'Semua' || doc.category === selectedCategory;
        const query = searchQuery.toLowerCase().trim();
        const matchesSearch = 
          doc.title.toLowerCase().includes(query) ||
          doc.description.toLowerCase().includes(query) ||
          doc.uploader.toLowerCase().includes(query) ||
          doc.category.toLowerCase().includes(query);
        const matchesVisibility = isAdmin || !doc.isHidden;
        return matchesCategory && matchesSearch && matchesVisibility;
      })
      .sort((a, b) => {
        // Pinned documents always float to top if sorted generally, 
        // to maintain clarity, we keep them sorted on top.
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;

        if (sortBy === 'newest') {
          return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
        }
        if (sortBy === 'popular') {
          return b.clicks - a.clicks;
        }
        if (sortBy === 'alpha') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [documents, selectedCategory, searchQuery, sortBy, isAdmin]);

  // Statistics Helper
  const stats = useMemo(() => {
    const visibleDocs = isAdmin ? documents : documents.filter(d => !d.isHidden);
    return {
      total: visibleDocs.length,
      pinned: visibleDocs.filter((d) => d.isPinned).length,
      categoriesCount: new Set(visibleDocs.map((d) => d.category)).size,
      totalClicks: visibleDocs.reduce((sum, d) => sum + d.clicks, 0)
    };
  }, [documents, isAdmin]);

  // File type design helpers
  const getFileTypeBadge = (type: DocumentLink['fileType']) => {
    switch (type) {
      case 'pdf':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">PDF</span>;
      case 'doc':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">DOCX</span>;
      case 'xls':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">EXCEL</span>;
      case 'ppt':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">POWERPOINT</span>;
      case 'drive':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">G-DRIVE</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">LINK</span>;
    }
  };

  const getFileTypeIcon = (type: DocumentLink['fileType']) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-500" />;
      case 'xls':
        return <FileSpreadsheet className="w-8 h-8 text-emerald-600" />;
      case 'doc':
        return <FileText className="w-8 h-8 text-blue-500" />;
      case 'ppt':
        return <FileCode className="w-8 h-8 text-orange-500" />;
      case 'drive':
        return <Database className="w-8 h-8 text-cyan-600" />;
      default:
        return <ExternalLink className="w-8 h-8 text-slate-500" />;
    }
  };

  return (
    <div id="school-portal-root" className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col antialiased">
      
      {/* TOAST NOTIFICATE AREA */}
      <div id="toast-manager" className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
              className={`p-4 rounded-xl shadow-lg border flex items-start gap-3 pointer-events-auto ${
                toast.type === 'success' 
                  ? 'bg-emerald-900/95 border-emerald-700 text-emerald-50' 
                  : toast.type === 'error'
                  ? 'bg-red-900/95 border-red-700 text-red-50'
                  : 'bg-slate-900/95 border-slate-800 text-slate-50'
              }`}
            >
              {toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 shrink-0 text-red-300 mt-0.5" />
              ) : (
                <Check className="w-5 h-5 shrink-0 text-emerald-300 mt-0.5" />
              )}
              <div className="flex-1 text-sm font-medium">{toast.message}</div>
              <button 
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-slate-400 hover:text-white transition-colors duration-150 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* TOP KEMENAG SUB-HEADER BAR */}
      <div id="kemenag-sub-header" className="bg-brand-900 text-white py-2 px-4 text-xs font-semibold tracking-wider flex flex-wrap justify-between items-center gap-2 border-b border-brand-800 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="bg-amber-500 text-brand-950 font-bold px-1.5 py-0.5 rounded text-[10px]">REPUBLIK INDONESIA</span>
          <span className="text-emerald-100 uppercase">Kementerian Agama RI · Kantor Kemenag Kabupaten Tasikmalaya</span>
        </div>
        <div className="font-mono text-emerald-200 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 self-center" />
          <span>{currentTime || 'Memuat waktu...'}</span>
        </div>
      </div>

      {/* MAIN HERO BRAND HEADER */}
      <header id="main-hero-header" className="relative overflow-hidden bg-gradient-to-br from-brand-800 to-brand-950 text-white py-10 px-6 sm:px-12 border-b border-brand-700 shadow-md">
        
        {/* Background Islamic Geometric Svg */}
        <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay">
          <svg width="100%" height="100%">
            <pattern id="patterns-islamic" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M40,0 L80,40 L40,80 L0,40 Z M40,10 L70,40 L40,70 L10,40 Z" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="40" cy="40" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#patterns-islamic)" />
          </svg>
        </div>

        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
          
          {/* Logo Crest & Title */}
          <div className="flex flex-col sm:flex-row items-center gap-5 text-center sm:text-left">
            <div className="w-20 h-20 bg-emerald-900 rounded-full border-4 border-amber-400 flex items-center justify-center shadow-inner flex-shrink-0 animate-pulse-slow">
              <Laptop className="w-10 h-10 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1.5">
                <span className="text-[10px] sm:text-xs font-bold bg-amber-500 text-brand-950 px-2.5 py-0.5 rounded-full tracking-wider uppercase">MODERN & DIGITAL MADRASAH</span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-sans">
                Portal Dokumen Digital <br />
                <span className="text-amber-400">MAN 1 Tasikmalaya</span>
              </h1>

            </div>
          </div>

          {/* Action Trigger "Tambah Link" on Main Screen Header */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0 justify-center">
            {isAdmin ? (
              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                <button
                  id="btn-tambah-link"
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-brand-950 font-bold px-6 py-3.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-150 transform hover:-translate-y-0.5 select-none w-full sm:w-auto"
                >
                  <Plus className="w-5 h-5 stroke-[3px]" />
                  <span>Tambah Tautan Baru</span>
                </button>
                <button
                  onClick={handleResetData}
                  title="Kembalikan Dokumen Bawaan MAN 1 Tasikmalaya"
                  className="flex items-center justify-center gap-2 bg-brand-900/60 hover:bg-brand-800/80 border border-brand-500 text-emerald-100 hover:text-white px-4 py-3.5 rounded-xl transition-all duration-150 w-full sm:w-auto text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4 text-emerald-300" />
                  <span>Reset Data</span>
                </button>
                <button
                  onClick={() => {
                    setCurrentPinInputForChange('');
                    setNewPinInput('');
                    setConfirmNewPinInput('');
                    setChangePinError('');
                    setIsChangePinModalOpen(true);
                  }}
                  title="Ubah PIN Otentikasi Administrator"
                  className="flex items-center justify-center gap-2 bg-emerald-800/80 hover:bg-emerald-700/90 border border-emerald-600 text-emerald-100 hover:text-white px-4 py-3.5 rounded-xl transition-all duration-150 w-full sm:w-auto text-sm font-medium"
                >
                  <KeyRound className="w-4 h-4 text-emerald-300" />
                  <span>Ubah PIN</span>
                </button>
                <button
                  onClick={() => {
                    setIsAdmin(false);
                    showToast('Keluar dari Mode Administrator. Anda sekarang berada di Mode Publik.', 'info');
                  }}
                  className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-3.5 rounded-xl transition-all duration-150 w-full sm:w-auto text-sm shadow-md"
                >
                  <Lock className="w-4 h-4" />
                  <span>Keluar Admin</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <div className="text-right hidden xl:block mr-2">
                  <p className="text-white/95 font-bold text-xs">🔓 Mode Penonton Publik</p>
                  <p className="text-emerald-300 text-[10px]">Tautan bersifat hanya-lihat</p>
                </div>
                <button
                  onClick={() => {
                    setAdminPinInput('');
                    setPinError('');
                    setIsAdminLoginModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 border border-emerald-500/50 text-white font-bold px-6 py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all duration-150 w-full sm:w-auto text-sm"
                >
                  <Unlock className="w-4 h-4 text-emerald-300" />
                  <span>Masuk Panel Admin</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* METRICS & STATISTICS BOARD */}
        <div id="stats-dashboard-bar" className="max-w-7xl mx-auto mt-8 pt-6 border-t border-brand-700/60 grid grid-cols-2 md:grid-cols-4 gap-4 text-center sm:text-left relative z-10">
          <div className="bg-brand-900/50 p-3.5 rounded-xl border border-brand-700/40 backdrop-blur-xs flex flex-col justify-center">
            <span className="text-xs text-emerald-200">Total Berkas Terdaftar</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono mt-0.5">{stats.total}</span>
          </div>
          <div className="bg-brand-900/50 p-3.5 rounded-xl border border-brand-700/40 backdrop-blur-xs flex flex-col justify-center">
            <span className="text-xs text-emerald-200">Dokumen Unggulan (Pinned)</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-mono mt-0.5">{stats.pinned}</span>
          </div>
          <div className="bg-brand-900/50 p-3.5 rounded-xl border border-brand-700/40 backdrop-blur-xs flex flex-col justify-center">
            <span className="text-xs text-emerald-200">Kategori Aktif</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono mt-0.5">{stats.categoriesCount}</span>
          </div>
          <div className="bg-brand-900/50 p-3.5 rounded-xl border border-brand-700/40 backdrop-blur-xs flex flex-col justify-center">
            <span className="text-xs text-emerald-200">Aktivitas Akses Tautan</span>
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-mono mt-0.5 flex items-center justify-center sm:justify-start gap-1">
              {stats.totalClicks} <span className="text-[10px] text-emerald-300 font-sans font-normal">klik</span>
            </span>
          </div>
        </div>

      </header>

      {/* DETAILED INTERACTIVE EXPLORER WRAPPER */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        
        {/* INTERACTIVE CONTROLS SECTION */}
        <div id="controls-section" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col gap-6">
          
          {/* SEARCH & SORT PANEL */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="search-input"
                type="text"
                placeholder="Cari dokumen, nomor SK, kata kunci deskripsi, atau bagian pengunggah..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 pl-12 pr-10 py-3.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-white text-sm transition-all duration-150"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
              {/* SORT COMPONENT */}
              <div className="flex items-center gap-2 bg-slate-50 pl-3 pr-2 py-1.5 rounded-xl border border-slate-200 flex-1 sm:flex-initial">
                <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-hidden pr-6 py-1 cursor-pointer w-full text-left"
                >
                  <option value="newest">Terbaru Diunggah</option>
                  <option value="oldest">Paling Lama</option>
                  <option value="popular">Paling Sering Diakses</option>
                  <option value="alpha">Judul berkas A-Z</option>
                </select>
              </div>

              {/* CLEAR FILTERS */}
              {(selectedCategory !== 'Semua' || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedCategory('Semua');
                    setSearchQuery('');
                    showToast('Filter pencarian dibersihkan.', 'info');
                  }}
                  className="flex items-center justify-center gap-1.5 text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 font-bold px-4 py-2.5 rounded-xl border border-red-200 transition-colors duration-150 shrink-0 flex-1 sm:flex-initial"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>

          {/* HORIZONTAL CATEGORY TICKER */}
          <div id="category-selector-container" className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 tracking-wider uppercase mb-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Saring Berdasarkan Unit / Kategori Berkas</span>
            </div>
            
            {/* Scrollable category trail */}
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const isActive = selectedCategory === cat;
                const count = cat === 'Semua' 
                  ? documents.length 
                  : documents.filter(d => d.category === cat).length;

                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all duration-150 select-none ${
                      isActive
                        ? 'bg-brand-800 border-brand-800 text-white shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/80 hover:text-slate-800'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                      isActive
                        ? 'bg-brand-900 text-amber-300'
                        : 'bg-slate-200/75 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* DOC LIST & MAIN CONTENT CONTAINER */}
        <div id="document-results-grid" className="flex flex-col gap-6">
          
          {/* SEARCH RESULT EXPLANATORY CAPTION */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 bg-slate-100/60 p-3.5 rounded-xl border border-slate-200/60">
            <div>
              Menampilkan <span className="font-bold text-slate-800">{filteredDocuments.length}</span> dari <span className="font-bold text-slate-800">{documents.length}</span> berkas digital
              {selectedCategory !== 'Semua' && (
                <span> di kategori <span className="font-bold text-emerald-800">"{selectedCategory}"</span></span>
              )}
              {searchQuery && (
                <span> cocok untuk pencarian <span className="font-mono text-slate-600 bg-slate-200/80 px-1.5 py-0.5 rounded text-xs">"{searchQuery}"</span></span>
              )}
            </div>
            <div className="text-xs text-slate-400 italic font-medium">
              Sematkan berkas penting untuk menempatkannya di atas
            </div>
          </div>

          {/* THE DOCUMENT LISTS (GRID CARD) */}
          {filteredDocuments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-4 border border-slate-200/60">
                <Search className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Berkas Tidak Ditemukan</h3>
              <p className="text-sm text-slate-500 max-w-md mt-1 leading-relaxed">
                Tidak ada dokumen digital yang cocok dengan filter atau kata kunci Anda saat ini. Harap ubah kata pencarian Anda atau tambahkan tautan dokumen ini.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('Semua');
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200"
                >
                  Bersihkan Pencarian
                </button>
                {isAdmin ? (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-5 py-2.5 bg-brand-800 hover:bg-brand-700 text-white font-semibold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Link Baru
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setAdminPinInput('');
                      setPinError('');
                      setIsAdminLoginModalOpen(true);
                    }}
                    className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-xl text-xs flex items-center gap-1"
                  >
                    <Unlock className="w-4 h-4" />
                    Masuk Admin untuk Berkas Baru
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence mode="popLayout">
                {filteredDocuments.map((doc) => (
                  <motion.div
                    key={doc.id}
                    layoutId={doc.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 25 }}
                    className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-md relative ${
                      doc.isPinned 
                        ? 'border-amber-400/80 bg-amber-50/10 ring-2 ring-amber-400/15' 
                        : 'border-slate-200/80 hover:border-brand-300'
                    }`}
                  >
                    
                    {/* PINNED RIBBON BACKGROUND */}
                    {doc.isPinned && (
                      <div className="absolute top-0 right-0 bg-amber-400 text-brand-950 px-3 py-1 font-extrabold text-[10px] uppercase tracking-wider rounded-bl-xl flex items-center gap-1 shadow-xs z-10">
                        <Pin className="w-3 h-3 fill-brand-900 stroke-brand-900" />
                        <span>Pinned</span>
                      </div>
                    )}

                    {/* HIDDEN VISIBILITY RIBBON (ADMIN-ONLY VISIBLE) */}
                    {doc.isHidden && (
                      <div className={`absolute top-0 ${doc.isPinned ? 'left-0 rounded-br-xl' : 'right-0 rounded-bl-xl'} bg-red-600 text-white px-3 py-1 font-extrabold text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-xs z-10`}>
                        <EyeOff className="w-3 h-3" />
                        <span>Tersembunyi</span>
                      </div>
                    )}

                    {/* CORE CONTENT HEADER */}
                    <div className="p-5 flex-1">
                      
                      {/* Meta information & category */}
                      <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                        {getFileTypeBadge(doc.fileType)}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200/60 max-w-[150px] truncate">
                          {doc.category}
                        </span>
                        {doc.isHidden && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                            <EyeOff className="w-3 h-3 text-red-500" />
                            Tersembunyi
                          </span>
                        )}
                      </div>

                      {/* Title block */}
                      <div className="flex items-start gap-3.5 mb-3">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 max-w-fit shrink-0 mt-0.5">
                          {getFileTypeIcon(doc.fileType)}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 leading-snug text-base line-clamp-2 select-text hover:text-brand-800 cursor-pointer" onClick={() => handleRecordClick(doc.id, doc.url)}>
                            {doc.title}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-1 font-medium">
                            Diunggah oleh: <span className="font-bold text-slate-500">{doc.uploader}</span>
                          </span>
                        </div>
                      </div>

                      {/* Description explanation */}
                      <p className="text-xs text-slate-500 leading-relaxed font-normal bg-slate-50 p-3 rounded-xl border border-slate-100 min-h-[56px] line-clamp-3 select-text mb-4">
                        {doc.description || 'Tidak ada deskripsi tambahan.'}
                      </p>

                    </div>

                    {/* DOCUMENT LOWER DATA & CONTROL ACTIONS BAR */}
                    <div className="bg-slate-50/70 py-3.5 px-5 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
                      
                      {/* Access date and dynamic counter */}
                      <div className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-1 text-[10px] font-mono">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{doc.dateAdded}</span>
                        </span>
                        <span className="text-[10px] text-slate-500 font-bold tracking-tight">
                          Diakses {doc.clicks} kali
                        </span>
                      </div>

                      {/* Buttons controls */}
                      <div className="flex items-center gap-1.5">
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleToggleVisibility(doc.id, !!doc.isHidden)}
                              title={doc.isHidden ? 'Tampilkan Dokumen ke Publik' : 'Sembunyikan Dokumen dari Publik'}
                              className={`p-2 rounded-xl border transition-all duration-150 ${
                                doc.isHidden
                                  ? 'bg-red-100 border-red-300 text-red-700 hover:bg-red-100'
                                  : 'bg-white border-slate-200 text-slate-500 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/30'
                              }`}
                            >
                              {doc.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>

                            <button
                              onClick={() => handleTogglePin(doc.id, doc.isPinned)}
                              title={doc.isPinned ? 'Lepas Sematan' : 'Sematkan Dokumen'}
                              className={`p-2 rounded-xl border transition-all duration-150 ${
                                doc.isPinned 
                                  ? 'bg-amber-100/75 border-amber-300 text-amber-700 hover:bg-amber-100' 
                                  : 'bg-white border-slate-200 text-slate-500 hover:text-amber-500 hover:border-amber-300 hover:bg-amber-50/30'
                              }`}
                            >
                              <Pin className={`w-4 h-4 ${doc.isPinned ? 'fill-amber-600' : ''}`} />
                            </button>

                            <button
                              onClick={() => handleDeleteDocument(doc.id, doc.title)}
                              title="Hapus Dokumen"
                              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50/30 transition-all duration-150"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleCopyLink(doc.url)}
                          title="Salin Tautan Berkas"
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all duration-150"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleRecordClick(doc.id, doc.url)}
                          className="flex items-center gap-1 px-3 py-2 bg-brand-800 hover:bg-brand-700 active:bg-brand-900 text-white font-bold rounded-xl shadow-xs transition-colors duration-150"
                        >
                          <span>Unduh / Buka</span>
                          <ExternalLink className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                      </div>

                    </div>

                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

        </div>

        {/* GUIDELINE SECTION accordion AT THE BOTTOM */}
        <div id="school-guideline-card" className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-4">
          <button
            onClick={() => setIsGuidelineExpanded(!isGuidelineExpanded)}
            className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors duration-150"
          >
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-brand-700 border border-brand-100">
                <BookOpen className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-bold text-slate-800">Pedoman & Panduan Kerja Basis Data Dokumen</h3>
                <p className="text-xs text-slate-500">Standarisasi penulisan link, keamanan berkas, dan tata tertib unggah MAN 1 Tasikmalaya</p>
              </div>
            </div>
            {isGuidelineExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
            )}
          </button>
          
          <AnimatePresence>
            {isGuidelineExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm leading-relaxed text-slate-600 bg-slate-50/50">
                  <div className="bg-white p-4.5 rounded-xl border border-slate-200/80">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">1</span>
                      Standardisasi Penamaan Berkas
                    </h4>
                    <p className="text-xs text-slate-500 mb-2">
                      Guna mempermudah pencarian, gunakan format penamaan seragam berikut sebelum mengunggah berkas ke cloud storage utama:
                    </p>
                    <code className="block bg-slate-100 text-[10px] p-2 rounded-lg font-mono text-slate-700 border border-slate-200">
                      MAN1_TSM_[Kategori]_[NamaDokumen]_[Tahun]
                    </code>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Contoh: <span className="font-mono text-slate-600 font-medium">MAN1_TSM_KURIKULUM_SK_Guru_Ganjil_2026.pdf</span>
                    </p>
                  </div>

                  <div className="bg-white p-4.5 rounded-xl border border-slate-200/80">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">2</span>
                      Keamanan Tautan (Privacy Sharing)
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-500">
                      <li>Pastikan Link Google Drive sudah diatur agar <b className="text-slate-700">"Siapa saja yang memiliki link dapat melihat"</b> (Viewer) untuk menghindari akses terkunci.</li>
                      <li>Jangan mengunggah dokumen sensitif berisi rincian password atau informasi rahasia.</li>
                      <li>Gunakan format Google Form khusus untuk isian data interaktif dari panitia/unit kerja.</li>
                    </ul>
                  </div>

                  <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 md:col-span-2 lg:col-span-1">
                    <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                      <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 text-xs font-extrabold flex items-center justify-center">3</span>
                      Tautan Eksternal Kemenag
                    </h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Akses cepat portal administrasi pusat kementerian agama yang sering digunakan di lingkungan kerja madrasah:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <a href="https://simpatika.kemenag.go.id" target="_blank" rel="noreferrer" className="bg-brand-50 hover:bg-brand-100 text-brand-800 p-2 rounded-lg font-bold border border-brand-100 text-center transition-colors">
                        Simpatika Kemenag
                      </a>
                      <a href="https://emis.kemenag.go.id" target="_blank" rel="noreferrer" className="bg-brand-50 hover:bg-brand-100 text-brand-800 p-2 rounded-lg font-bold border border-brand-100 text-center transition-colors">
                        EMIS Kemenag
                      </a>
                      <a href="https://sakti.kemenkeu.go.id" target="_blank" rel="noreferrer" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-bold border border-slate-200 text-center transition-colors">
                        Sakti Keuangan
                      </a>
                      <a href="https://puskas.kemenag.go.id" target="_blank" rel="noreferrer" className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg font-bold border border-slate-200 text-center transition-colors">
                        e-Madrasah / RDM
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </main>

      {/* SYSTEM CONTROLS AND DOCUMENT LOGO BAR FOOTER */}
      <footer id="app-portal-footer" className="bg-slate-900 text-slate-400 py-12 px-6 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-3 justify-center md:justify-start">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center shadow-inner">
              <Laptop className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-white font-bold tracking-tight">MAN 1 Tasikmalaya</p>
              <p className="text-xs text-slate-500">Madrasah Aliyah Negeri Kebanggaan Tasikmalaya</p>
            </div>
          </div>
          
          <div className="text-xs flex flex-col items-center md:items-end gap-1 font-medium">
            <span className="text-slate-300">© 2026 Basis Data Dokumen Digital MAN 1 Tasikmalaya. Rapat & Penyelenggaraan Terbuka.</span>
            <span className="text-[10px] text-slate-500">Dibuat untuk mempercepat efisiensi administrasi madrasah mandiri berprestasi.</span>
          </div>
        </div>
      </footer>

      {/* DYNAMIC MODAL PANEL (ADD LINK FORM) */}
      <AnimatePresence>
        {isModalOpen && (
          <div id="add-link-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs"
            />

            {/* Modal Body Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              
              {/* Header */}
              <div className="bg-brand-900 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-400 text-brand-950 p-1 rounded">
                    <Database className="w-5 h-5 stroke-[2.5]" />
                  </span>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base">Tambah Tautan Dokumen Baru</h3>
                    <p className="text-[10px] sm:text-xs text-emerald-200">Sistem Registrasi Berkas Pendukung Kegiatan Madrasah</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-emerald-100 hover:text-white p-1 rounded-full hover:bg-brand-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Scrollable Area */}
              <form onSubmit={handleAddDocument} className="p-6 overflow-y-auto space-y-4">
                
                {/* 1. Judul Dokumen */}
                <div>
                  <label htmlFor="doc-title" className="block text-xs font-bold text-slate-600 uppercase mb-1 flex items-center justify-between">
                    <span>Judul Berkas / Dokumen <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-slate-400 font-normal">Maksimal 120 Karakter</span>
                  </label>
                  <input
                    id="doc-title"
                    type="text"
                    required
                    placeholder="Contoh: Kalender Akademik MAN 1 Tasikmalaya TA 2025/2026"
                    value={formTitle}
                    onChange={(e) => {
                      setFormTitle(e.target.value);
                      if (formErrors.title) {
                        setFormErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.title;
                          return copy;
                        });
                      }
                    }}
                    maxLength={120}
                    className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-white transition-all ${
                      formErrors.title ? 'border-red-500 focus:ring-red-400' : 'border-slate-200'
                    }`}
                  />
                  {formErrors.title && (
                    <p className="text-xs text-red-500 mt-1 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {formErrors.title}
                    </p>
                  )}
                </div>

                {/* 2. URL Tautan */}
                <div>
                  <label htmlFor="doc-url" className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Tautan / Link Berkas <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="doc-url"
                    type="url"
                    required
                    placeholder="https://drive.google.com/file/d/... atau alamat URL berkas"
                    value={formUrl}
                    onChange={(e) => {
                      setFormUrl(e.target.value);
                      if (formErrors.url) {
                        setFormErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.url;
                          return copy;
                        });
                      }
                    }}
                    className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-white transition-all ${
                      formErrors.url ? 'border-red-500 focus:ring-red-400' : 'border-slate-200'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400 block mt-1 leading-normal">
                    Format diperbolehkan: Tautan Google Drive, Dropbox, OneDrive, website resmi, atau tautan file cloud apa pun dimulai dengan <code className="bg-slate-100 p-0.5 rounded text-slate-600">https://</code>
                  </span>
                  {formErrors.url && (
                    <p className="text-xs text-red-500 mt-1 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {formErrors.url}
                    </p>
                  )}
                </div>

                {/* Grid Category & File Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category select */}
                  <div>
                    <label htmlFor="doc-category" className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Kategori / Bidang <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        id="doc-category"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-whiteAppearance cursor-pointer"
                      >
                        <option value="Kurikulum">Kurikulum</option>
                        <option value="Kesiswaan">Kesiswaan</option>
                        <option value="Humas & Kerjasama">Humas & Kerjasama</option>
                        <option value="Sarana Prasarana">Sarana Prasarana</option>
                        <option value="Tata Usaha & Kepegawaian">Tata Usaha & Kepegawaian</option>
                        <option value="SK & Surat Tugas">SK & Surat Tugas</option>
                        <option value="Formulir Digital">Formulir Digital</option>
                        <option value="Lainnya">Lainnya</option>
                      </select>
                    </div>
                  </div>

                  {/* File Type */}
                  <div>
                    <label htmlFor="doc-type" className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Format Tampilan File <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="doc-type"
                      value={formFileType}
                      onChange={(e) => setFormFileType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-whiteAppearance cursor-pointer"
                    >
                      <option value="pdf">PDF (.pdf)</option>
                      <option value="doc">Dokumen Word (.doc, .docx)</option>
                      <option value="xls">Lembar Kerja Excel (.xls, .xlsx, .csv)</option>
                      <option value="ppt">Presentasi PowerPoint (.ppt, .pptx)</option>
                      <option value="drive">Folder Google Drive / Pintasan Cloud</option>
                      <option value="link">Tautan Web Umum / Formulir Isian</option>
                    </select>
                  </div>
                </div>

                {/* 3. Pengunggah / Kontributor */}
                <div>
                  <label htmlFor="doc-uploader" className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Bagian / Pengunggah <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="doc-uploader"
                    type="text"
                    required
                    placeholder="Contoh: Waka Kurikulum, Humas MAN 1, atau Staff TU"
                    value={formUploader}
                    onChange={(e) => {
                      setFormUploader(e.target.value);
                      if (formErrors.uploader) {
                        setFormErrors((prev) => {
                          const copy = { ...prev };
                          delete copy.uploader;
                          return copy;
                        });
                      }
                    }}
                    className={`w-full bg-slate-50 border px-3.5 py-2.5 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-white transition-all ${
                      formErrors.uploader ? 'border-red-500 focus:ring-red-400' : 'border-slate-200'
                    }`}
                  />
                  {formErrors.uploader && (
                    <p className="text-xs text-red-500 mt-1 font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {formErrors.uploader}
                    </p>
                  )}
                </div>

                {/* 4. Deskripsi singkat */}
                <div>
                  <label htmlFor="doc-desc" className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Deskripsi / Catatan Tambahan (Opsional)
                  </label>
                  <textarea
                    id="doc-desc"
                    rows={2}
                    placeholder="Tambahkan catatan kelengkapan berkas, lampiran rujukan, atau instruksi singkat..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-600 focus:bg-white transition-all"
                  />
                </div>

                {/* 5. Pin & Hide Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                    <input
                      id="form-pin"
                      type="checkbox"
                      checked={formIsPinned}
                      onChange={(e) => setFormIsPinned(e.target.checked)}
                      className="w-4 h-4 text-brand-600 focus:ring-brand-500 border-slate-300 rounded"
                    />
                    <label htmlFor="form-pin" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                      Sematkan Berkas di Atas (Pinned)
                    </label>
                  </div>

                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center gap-3">
                    <input
                      id="form-hidden"
                      type="checkbox"
                      checked={formIsHidden}
                      onChange={(e) => setFormIsHidden(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-slate-300 rounded"
                    />
                    <label htmlFor="form-hidden" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                      Sembunyikan dari Publik
                    </label>
                  </div>
                </div>

              </form>

              {/* Form Action Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4.5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 font-bold rounded-xl text-xs text-slate-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddDocument}
                  className="px-5 py-2.5 bg-brand-800 hover:bg-brand-700 active:bg-brand-900 font-bold rounded-xl text-xs text-white flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Simpan Dokumen</span>
                </button>
              </div>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* DYNAMIC MODAL PANEL (ADMIN PASSCODE VERIFICATION) */}
      <AnimatePresence>
        {isAdminLoginModalOpen && (
          <div id="admin-login-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminLoginModalOpen(false)}
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            />

            {/* Modal Body Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.25 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden relative z-10 flex flex-col"
            >
              
              {/* Header */}
              <div className="bg-emerald-900 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="bg-emerald-800 p-2 rounded-lg border border-emerald-700">
                    <Lock className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base">Verifikasi Administrator</h3>
                    <p className="text-[10px] text-emerald-200">Hak Akses Manajemen Berkas Digital</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAdminLoginModalOpen(false)}
                  className="text-emerald-200 hover:text-white p-1 rounded-full hover:bg-emerald-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Silakan masukkan PIN otentikasi untuk membuka kontrol penuh manajemen dokumen (menambah link, menghapus berkas, dan menyematkan dokumen utama).
                </p>

                <div className="space-y-1">
                  <label htmlFor="admin-pin-field" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    PIN Keamanan Administrator <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="admin-pin-field"
                    type="password"
                    placeholder="Masukkan PIN Admin..."
                    value={adminPinInput}
                    onChange={(e) => {
                      setAdminPinInput(e.target.value);
                      if (pinError) setPinError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // Trigger verification
                        handleVerifyLogin(adminPinInput);
                      }
                    }}
                    autoFocus
                    className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-xl text-center text-lg font-bold tracking-widest focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-slate-800"
                  />
                  {pinError ? (
                    <p className="text-xs text-red-500 font-semibold flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {pinError}
                    </p>
                  ) : (
                    <div className="bg-emerald-50 text-emerald-800 text-[11px] p-2.5 rounded-lg border border-emerald-100 flex items-start gap-1.5 mt-2">
                      <Info className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <span>Gunakan kode PIN khusus administrator untuk mengelola berkas. Bawaan sistem: <b>admin123</b>.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAdminLoginModalOpen(false)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 font-bold rounded-xl text-xs text-slate-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={() => handleVerifyLogin(adminPinInput)}
                  className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1 shadow-sm transition-colors"
                >
                  <Unlock className="w-4 h-4 stroke-[2.5]" />
                  <span>Verifikasi PIN</span>
                </button>
              </div>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* CHANGE PIN MODAL */}
      <AnimatePresence>
        {isChangePinModalOpen && (
          <div id="change-pin-modal-container" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Dark Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChangePinModalOpen(false)}
              className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs"
            />

            {/* Modal Body Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.25 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-md overflow-hidden relative z-10 flex flex-col"
            >
              
              {/* Header */}
              <div className="bg-emerald-900 text-white p-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="bg-emerald-800 p-2 rounded-lg border border-emerald-700">
                    <KeyRound className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-base">Ubah PIN Administrator</h3>
                    <p className="text-[10px] text-emerald-200">Ganti Kata Sandi Kontrol Berkas</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsChangePinModalOpen(false)}
                  className="text-emerald-200 hover:text-white p-1 rounded-full hover:bg-emerald-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleChangePin} className="p-6 space-y-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Demi keamanan, silakan verifikasi PIN Anda saat ini terlebih dahulu sebelum menetapkan PIN keamanan yang baru.
                </p>

                {changePinError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                    <span>{changePinError}</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Current PIN */}
                  <div className="space-y-1">
                    <label htmlFor="current-pin-field" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      PIN Sekarang <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="current-pin-field"
                      type="password"
                      placeholder="Masukkan PIN lama..."
                      value={currentPinInputForChange}
                      onChange={(e) => setCurrentPinInputForChange(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-sm font-semibold tracking-wide"
                    />
                  </div>

                  {/* New PIN */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="new-pin-field" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        PIN Baru <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="new-pin-field"
                        type="password"
                        placeholder="PIN Baru..."
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-sm font-semibold tracking-wide"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="confirm-pin-field" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        Konfirmasi PIN <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="confirm-pin-field"
                        type="password"
                        placeholder="Ulangi PIN..."
                        value={confirmNewPinInput}
                        onChange={(e) => setConfirmNewPinInput(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-sm font-semibold tracking-wide"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsChangePinModalOpen(false)}
                    className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 font-bold rounded-xl text-xs text-slate-600 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Perbarui PIN</span>
                  </button>
                </div>
              </form>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
