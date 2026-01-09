/**
 * Message formatters for Telegram publishing
 * All messages are bilingual (English + Arabic)
 */

interface Author {
  id: string;
  full_name: string;
  email?: string;
}

interface IndexAnalysis {
  id: string;
  index_symbol: string;
  title: string;
  body: string;
  timeframe?: string;
  schools_used?: string[];
  invalidation_price?: number;
  chart_image_url?: string;
  author: Author;
}

interface IndexTrade {
  id: string;
  polygon_option_ticker?: string;
  strike?: number;
  expiry?: string;
  option_type?: string;
  direction: string;
  status: string;
  entry_contract_snapshot: any;
  current_contract?: number;
  contract_high_since?: number;
  contract_url?: string;
  targets?: any[];
  stoploss?: any;
  win_condition_met?: string;
  loss_condition_met?: string;
  author: Author;
  analysis?: {
    id: string;
    title: string;
    index_symbol: string;
  };
}

interface Update {
  id: string;
  text_en?: string;
  text_ar?: string;
  body?: string;
  update_type?: string;
  attachment_url?: string;
  author: Author;
  analysis?: {
    id: string;
    title: string;
    index_symbol: string;
  };
  trade?: {
    id: string;
    polygon_option_ticker?: string;
    strike?: number;
    expiry?: string;
    analysis: {
      id: string;
      title: string;
      index_symbol: string;
    };
  };
}

export function formatAnalysisMessage(
  analysis: IndexAnalysis,
  baseUrl: string
): { text: string; snapshotImageUrl?: string } {
  const analysisUrl = `${baseUrl}/dashboard/analysis/${analysis.id}`;
  const timeframe = analysis.timeframe || "N/A";
  const schools = analysis.schools_used?.join(", ") || "N/A";

  let message = "📊 <b>NEW INDEX ANALYSIS</b>\n\n";
  message += `<b>Index:</b> ${analysis.index_symbol}\n`;
  message += `<b>Timeframe:</b> ${timeframe}\n`;
  message += `<b>Analyst:</b> ${analysis.author.full_name}\n`;

  if (schools) {
    message += `<b>Methods:</b> ${schools}\n`;
  }

  message += `\n<b>Title:</b> ${analysis.title}\n\n`;

  const bodyPreview = analysis.body.length > 200
    ? analysis.body.substring(0, 200) + "..."
    : analysis.body;
  message += `${bodyPreview}\n\n`;

  if (analysis.invalidation_price) {
    message += `<b>⚠️ Invalidation:</b> ${analysis.invalidation_price.toFixed(2)}\n\n`;
  }

  message += `<a href="${analysisUrl}">📈 View Full Analysis</a>`;

  message += "\n\n━━━━━━━━━━\n\n";
  message += "📊 <b>تحليل جديد للمؤشر</b>\n\n";
  message += `<b>المؤشر:</b> ${analysis.index_symbol}\n`;
  message += `<b>الإطار الزمني:</b> ${timeframe}\n`;
  message += `<b>المحلل:</b> ${analysis.author.full_name}\n\n`;
  message += `<b>العنوان:</b> ${analysis.title}\n\n`;

  if (analysis.invalidation_price) {
    message += `<b>⚠️ الإبطال:</b> ${analysis.invalidation_price.toFixed(2)}\n\n`;
  }

  message += `<a href="${analysisUrl}">📈 عرض التحليل الكامل</a>`;

  const snapshotImageUrl = analysis.chart_image_url || undefined;

  return { text: message, snapshotImageUrl };
}

export function formatTradeMessage(
  trade: IndexTrade,
  baseUrl: string,
  isNewHigh: boolean = false
): { text: string; snapshotImageUrl?: string } {
  console.log('[MessageFormatter] formatTradeMessage called with:', {
    tradeId: trade.id,
    hasContractUrl: !!trade.contract_url,
    contractUrl: trade.contract_url,
    isNewHigh,
  });

  const analysisUrl = trade.analysis ? `${baseUrl}/dashboard/analysis/${trade.analysis.id}` : '#';
  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const target1 = trade.targets && trade.targets.length > 0 ? trade.targets[0].level : null;
  const stopPrice = trade.stoploss?.level;

  let cleanSymbol = trade.analysis?.index_symbol || (trade as any).underlying_index_symbol || 'Index';
  if (trade.polygon_option_ticker) {
    const parts = trade.polygon_option_ticker.split(':');
    if (parts.length > 1) {
      const tickerPart = parts[1];
      cleanSymbol = tickerPart.replace(/\d{6}[CP]\d{8}$/, '');
    }
  }

  let message = isNewHigh ? "🚀 <b>NEW HIGH ALERT!</b>\n\n" : "🎯 <b>NEW TRADE</b>\n\n";
  message += `<b>Index:</b> ${trade.analysis?.index_symbol || (trade as any).underlying_index_symbol}\n`;
  if (trade.analysis) {
    message += `<b>Analysis:</b> ${trade.analysis.title}\n`;
  }
  message += `<b>Direction:</b> ${trade.direction.toUpperCase()}\n`;

  if (trade.polygon_option_ticker) {
    message += `<b>Contract:</b> ${cleanSymbol} ${trade.strike?.toFixed(0)}\n`;
    message += `<b>Expiry:</b> ${trade.expiry}\n`;
  }

  message += `<b>Entry:</b> ${entryPrice.toFixed(2)}\n`;

  if (isNewHigh && trade.contract_high_since) {
    message += `<b>Current:</b> ${trade.current_contract?.toFixed(2)} 🎉\n`;
    message += `<b>Highest:</b> ${trade.contract_high_since.toFixed(2)}\n`;
  }

  if (target1) {
    message += `<b>Target 1:</b> ${target1.toFixed(2)}\n`;
  }

  if (stopPrice) {
    message += `<b>Stop Loss:</b> ${stopPrice.toFixed(2)}\n`;
  }

  message += `\n<b>Analyst:</b> ${trade.author.full_name}\n\n`;
  if (trade.analysis) {
    message += `<a href="${analysisUrl}">📊 View Analysis</a>`;
  }

  message += "\n\n━━━━━━━━━━\n\n";
  message += isNewHigh ? "🚀 <b>تنبيه قمة جديدة!</b>\n\n" : "🎯 <b>صفقة جديدة</b>\n\n";
  message += `<b>المؤشر:</b> ${trade.analysis?.index_symbol || (trade as any).underlying_index_symbol}\n`;
  if (trade.analysis) {
    message += `<b>التحليل:</b> ${trade.analysis.title}\n`;
  }
  message += `<b>الاتجاه:</b> ${trade.direction === "call" ? "شراء" : "بيع"}\n`;

  if (trade.polygon_option_ticker) {
    message += `<b>العقد:</b> ${cleanSymbol} ${trade.strike?.toFixed(0)}\n`;
  }

  message += `<b>الدخول:</b> ${entryPrice.toFixed(2)}\n`;

  if (isNewHigh && trade.contract_high_since) {
    message += `<b>الحالي:</b> ${trade.current_contract?.toFixed(2)} 🎉\n`;
    message += `<b>الأعلى:</b> ${trade.contract_high_since.toFixed(2)}\n`;
  }

  if (target1) {
    message += `<b>الهدف 1:</b> ${target1.toFixed(2)}\n`;
  }

  if (stopPrice) {
    message += `<b>وقف الخسارة:</b> ${stopPrice.toFixed(2)}\n`;
  }

  message += `\n<b>المحلل:</b> ${trade.author.full_name}\n\n`;
  if (trade.analysis) {
    message += `<a href="${analysisUrl}">📊 عرض التحليل</a>`;
  }

  const snapshotImageUrl = trade.contract_url || undefined;

  return { text: message, snapshotImageUrl };
}

export function formatUpdateMessage(
  update: Update,
  updateFor: "analysis" | "trade",
  baseUrl: string
): { text: string } {
  const textEn = update.text_en || update.body || "";
  const textAr = update.text_ar || "";
  
  let entityInfo = "";
  let entityInfoAr = "";
  let url = "";
  
  if (updateFor === "analysis" && update.analysis) {
    entityInfo = `${update.analysis.index_symbol} - ${update.analysis.title}`;
    entityInfoAr = `${update.analysis.index_symbol} - ${update.analysis.title}`;
    url = `${baseUrl}/dashboard/analysis/${update.analysis.id}`;
  } else if (updateFor === "trade" && update.trade) {
    entityInfo = `${update.trade.analysis.index_symbol} - ${update.trade.polygon_option_ticker || "Trade"}`;
    entityInfoAr = `${update.trade.analysis.index_symbol} - ${update.trade.polygon_option_ticker || "صفقة"}`;
    url = `${baseUrl}/dashboard/analysis/${update.trade.analysis.id}`;
  }

  let message = "📢 <b>UPDATE</b>\n\n";
  message += `<b>On:</b> ${entityInfo}\n`;
  message += `<b>By:</b> ${update.author.full_name}\n\n`;
  message += `${textEn}\n\n`;
  message += `<a href="${url}">View Details</a>`;

  message += "\n\n━━━━━━━━━━\n\n";
  message += "📢 <b>تحديث</b>\n\n";
  message += `<b>على:</b> ${entityInfoAr}\n`;
  message += `<b>من:</b> ${update.author.full_name}\n\n`;
  
  if (textAr) {
    message += `${textAr}\n\n`;
  }
  
  message += `<a href="${url}">عرض التفاصيل</a>`;

  return { text: message };
}

export function formatTradeResultMessage(
  trade: IndexTrade,
  baseUrl: string
): { text: string } {
  const analysisUrl = `${baseUrl}/dashboard/analysis/${trade.analysis.id}`;
  const isWin = trade.status === "tp_hit";
  const entryPrice = trade.entry_contract_snapshot?.mid || trade.entry_contract_snapshot?.last || 0;
  const currentPrice = trade.current_contract || 0;
  const highestPrice = trade.contract_high_since || 0;
  const pnlPercent = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);

  let cleanSymbol = trade.analysis.index_symbol;
  if (trade.polygon_option_ticker) {
    const parts = trade.polygon_option_ticker.split(':');
    if (parts.length > 1) {
      const tickerPart = parts[1];
      cleanSymbol = tickerPart.replace(/\d{6}[CP]\d{8}$/, '');
    }
  }

  let message = "";

  if (isWin) {
    message = "🎉 <b>TRADE WIN!</b>\n\n";
  } else {
    message = "🛑 <b>TRADE STOPPED</b>\n\n";
  }

  message += `<b>Index:</b> ${trade.analysis.index_symbol}\n`;
  message += `<b>Direction:</b> ${trade.direction.toUpperCase()}\n`;

  if (trade.polygon_option_ticker) {
    message += `<b>Contract:</b> ${cleanSymbol} ${trade.strike?.toFixed(0)}\n`;
  }
  
  message += `<b>Entry:</b> ${entryPrice.toFixed(2)}\n`;
  message += `<b>Close:</b> ${currentPrice.toFixed(2)}\n`;
  message += `<b>Highest After Entry:</b> ${highestPrice.toFixed(2)}\n`;
  message += `<b>P/L:</b> ${pnlPercent}%\n\n`;
  
  if (isWin && trade.win_condition_met) {
    message += `<i>${trade.win_condition_met}</i>\n\n`;
  } else if (!isWin && trade.loss_condition_met) {
    message += `<i>${trade.loss_condition_met}</i>\n\n`;
  }
  
  message += `<b>Analyst:</b> ${trade.author.full_name}\n\n`;
  message += `<a href="${analysisUrl}">📊 View Analysis</a>`;

  message += "\n\n━━━━━━━━━━\n\n";
  
  if (isWin) {
    message += "🎉 <b>فوز في الصفقة!</b>\n\n";
  } else {
    message += "🛑 <b>إيقاف الصفقة</b>\n\n";
  }
  
  message += `<b>المؤشر:</b> ${trade.analysis.index_symbol}\n`;
  message += `<b>الاتجاه:</b> ${trade.direction === "call" ? "شراء" : "بيع"}\n`;

  if (trade.polygon_option_ticker) {
    message += `<b>العقد:</b> ${cleanSymbol} ${trade.strike?.toFixed(0)}\n`;
  }
  
  message += `<b>الدخول:</b> ${entryPrice.toFixed(2)}\n`;
  message += `<b>الإغلاق:</b> ${currentPrice.toFixed(2)}\n`;
  message += `<b>أعلى سعر بعد الدخول:</b> ${highestPrice.toFixed(2)}\n`;
  message += `<b>الربح/الخسارة:</b> ${pnlPercent}%\n\n`;
  
  message += `<b>المحلل:</b> ${trade.author.full_name}\n\n`;
  message += `<a href="${analysisUrl}">📊 عرض التحليل</a>`;

  return { text: message };
}