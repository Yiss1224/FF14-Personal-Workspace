// 部署設定：同步要接到哪裡。兩者都留空 = 純本機模式（資料只存在瀏覽器）。
window.FF14_CONFIG={
 // 自架伺服器網址，例如 'https://ff14.example.com'。填了就優先使用自架伺服器。
 apiBase:'',
 // 過渡期：自架伺服器上線前，沿用原本的 Supabase 專案同步。改用自架伺服器後把這段刪掉即可。
 supabase:{
  url:'https://sxfvfiukywcgteioxsva.supabase.co',
  key:'sb_publishable_lgNIyKPIds4TFc7H23xIlA_HSAv1Q9f'
 }
};
