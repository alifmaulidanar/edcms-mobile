export const TICKET_CONFIG = {
  pullout: {
    TOTAL_PHASES: 1,
    PHOTOS_PER_PHASE: [4],
    TOTAL_PHOTOS: 4,
    photoTitles: [
      'Foto EDC',
      'Foto BAST',
      'Foto PIC Merchant',
      'Foto Struk #1',
    ]
  },
  single: {
    TOTAL_PHASES: 2,
    PHOTOS_PER_PHASE: [4, 4],
    TOTAL_PHOTOS: 8,
    photoTitles: [
      'Foto Plang',
      'Foto EDC',
      'Foto SIM Card + SN EDC + SAM Card',
      'Foto Roll Sales Draft',
      'Foto Sales Draft',
      'Foto BAST',
      'Foto Surat Pernyataan Training',
      'Foto PIC Merchant',
    ]
  },
  default: {
    TOTAL_PHASES: 2,
    PHOTOS_PER_PHASE: [4, 4],
    TOTAL_PHOTOS: 8,
    photoTitles: [
      'Foto Plang',
      'Foto EDC',
      'Foto SIM Card + SN EDC + SAM Card',
      'Foto Roll Sales Draft',
      'Foto Sales Draft',
      'Foto BAST',
      'Foto Surat Pernyataan Training',
      'Foto PIC Merchant',
    ]
  },
  sharing: {
    TOTAL_PHASES: 4,
    PHOTOS_PER_PHASE: [5, 5, 5, 4],
    TOTAL_PHOTOS: 19,
    photoTitles: [
      // Phase 1 (1-5)
      'Foto Plang',
      'Foto EDC',
      'Foto Stiker EDC',
      'Foto Screen Gard',
      'Foto SIM Card + SN EDC + SAM Card',
      // Phase 2 (6-10)
      'Foto Sales Draft',
      'Foto PIC Merchant',
      'Foto Roll Sales Draft',
      'Foto Surat Pernyataan Training',
      'Foto Aplikasi EDC',
      // Phase 3 (11-15)
      'Foto Sales Draft Patch L (EDC Konven)',
      'Foto Screen P2G (EDC Android)',
      'Foto BAST',
      'Foto Sales Draft All Member Bank (tampak logo bank)',
      'Foto Sales Draft BMRI',
      // Phase 4 (16-19)
      'Foto Sales Draft BNI',
      'Foto Sales Draft BRI',
      'Foto Sales Draft BTN',
      'Foto No Telepon TY dan No PIC Kawasan/TL di Belakang EDC',
    ]
  }
};

export function getPhotoTitles(ticket: any): string[] {
  const tipe = (ticket?.additional_info?.tipe_tiket || '').toLowerCase().replace(/\s+/g, '');
  const service = (ticket?.additional_info?.edc_service || '').toLowerCase();
  if (tipe.includes('pullout')) return TICKET_CONFIG.pullout.photoTitles;
  if (service.includes('sharing')) return TICKET_CONFIG.sharing.photoTitles;
  if (service.includes('single')) return TICKET_CONFIG.single.photoTitles;
  return TICKET_CONFIG.default.photoTitles;
} 