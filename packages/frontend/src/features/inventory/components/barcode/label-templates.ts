export interface LabelPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
  showStoreNameDefault: boolean;
  showPriceDefault: boolean;
  showSkuDefault: boolean;
  fontSize: {
    title: string;
    price: string;
    barcodeDigits: string;
  };
}

export const LABEL_PRESETS: Record<string, LabelPreset> = {
  STANDARD_50X25: {
    id: 'STANDARD_50X25',
    name: '50 × 25 مم (قياسي للملحقات)',
    widthMm: 50,
    heightMm: 25,
    description: 'المقاس الأكثر شيوعاً لطابعات Xprinter و Zebra',
    showStoreNameDefault: true,
    showPriceDefault: true,
    showSkuDefault: true,
    fontSize: { title: '9px', price: '12px', barcodeDigits: '8px' },
  },
  COMPACT_40X30: {
    id: 'COMPACT_40X30',
    name: '40 × 30 مم (بطاقة الرف)',
    widthMm: 40,
    heightMm: 30,
    description: 'مناسب لبطاقات الرفوف والصناديق الصغيرة',
    showStoreNameDefault: true,
    showPriceDefault: true,
    showSkuDefault: false,
    fontSize: { title: '9px', price: '13px', barcodeDigits: '8px' },
  },
  MICRO_30X20: {
    id: 'MICRO_30X20',
    name: '30 × 20 مم (ملصق مصغر)',
    widthMm: 30,
    heightMm: 20,
    description: 'مناسب للكابلات والشواحن وقطع الغيار الدقيقة',
    showStoreNameDefault: false,
    showPriceDefault: true,
    showSkuDefault: false,
    fontSize: { title: '8px', price: '10px', barcodeDigits: '7px' },
  },
  DEVICE_60X40: {
    id: 'DEVICE_60X40',
    name: '60 × 40 مم (هواتف وأجهزة مع IMEI)',
    widthMm: 60,
    heightMm: 40,
    description: 'ملصق كامل للهواتف المستعملة والصيانة يتضمن الـ IMEI والمواصفات',
    showStoreNameDefault: true,
    showPriceDefault: true,
    showSkuDefault: true,
    fontSize: { title: '10px', price: '14px', barcodeDigits: '9px' },
  },
};

export const LABEL_PRESET_LIST = Object.values(LABEL_PRESETS);
