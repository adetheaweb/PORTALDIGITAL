/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DocumentLink {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string;
  fileType: 'pdf' | 'doc' | 'xls' | 'ppt' | 'drive' | 'link';
  dateAdded: string;
  uploader: string;
  isPinned: boolean;
  clicks: number;
  isHidden?: boolean;
}

export type CategoryType = 
  | 'Semua'
  | 'Kurikulum'
  | 'Kesiswaan'
  | 'Humas & Kerjasama'
  | 'Sarana Prasarana'
  | 'Tata Usaha & Kepegawaian'
  | 'SK & Surat Tugas'
  | 'Formulir Digital'
  | 'Lainnya';
