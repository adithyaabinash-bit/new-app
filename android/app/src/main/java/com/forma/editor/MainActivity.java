package com.forma.editor;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Locale;

/** Native Forma editor. The editor surface, document handling and export run in Android code. */
public class MainActivity extends Activity {
    private static final int OPEN_FILE = 1;
    private static final int SAVE_FILE = 2;
    private final int ink = Color.rgb(76, 99, 225);
    private LinearLayout root, toolbar, textEntryRow, pdfPageTools;
    private ScrollView pageScroll;
    private NativePageView pageView;
    private TextView title, pageLabel, status;
    private EditText textEntry;
    private EditText documentEditor;
    private Uri sourceUri;
    private String fileName = "Untitled document.txt", fileKind = "text", tool = "select";
    private String textContent = "";
    private Bitmap background;
    private Object pdfRenderer;
    private int pdfPages = 0, pageIndex = 0;
    private final ArrayList<Integer> pdfSourcePages = new ArrayList<>();
    private final ArrayList<ArrayList<Mark>> pdfPageMarks = new ArrayList<>();
    private float zoom = 1f;
    private String exportFormat = "";
    private boolean insertImagePending = false;
    private boolean showingHome = true;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(0x2000);
        buildScreen();
        renderSurface();
        showHome();
    }

    private int dp(float value) { return (int)(value * getResources().getDisplayMetrics().density + .5f); }
    private TextView label(String value, int size, int color) {
        TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); return v;
    }
    private Button button(String value, Runnable action) {
        Button b = new Button(this); b.setText(value); b.setTextSize(12); b.setAllCaps(false); b.setMinHeight(dp(40)); b.setPadding(dp(10),0,dp(10),0);
        GradientDrawable surface=new GradientDrawable();surface.setCornerRadius(dp(11));boolean primary=value.equals("Export")||value.equals("Place");surface.setColor(primary?Color.rgb(92,83,226):Color.WHITE);if(!primary)surface.setStroke(dp(1),Color.rgb(224,228,238));b.setBackground(surface);b.setTextColor(primary?Color.WHITE:Color.rgb(47,58,83));
        b.setOnClickListener(v -> action.run()); return b;
    }
    private LinearLayout row() { LinearLayout v = new LinearLayout(this); v.setOrientation(LinearLayout.HORIZONTAL); v.setGravity(Gravity.CENTER_VERTICAL); return v; }
    private void buildScreen() {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(245,247,251));
        LinearLayout top = row(); top.setPadding(dp(10),dp(5),dp(10),dp(5)); top.setBackgroundColor(Color.WHITE);
        TextView logo = label("forma.",20,Color.rgb(35,44,66)); logo.setTypeface(null,1); top.addView(logo,new LinearLayout.LayoutParams(0,dp(48),1));
        top.addView(button("Save", this::saveLocally)); top.addView(button("Export", this::showExports));
        root.addView(top);
        title = label(fileName,13,Color.rgb(38,49,72)); title.setPadding(dp(14),dp(8),dp(14),dp(8)); title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE); root.addView(title);

        HorizontalScrollView toolsScroll = new HorizontalScrollView(this); toolsScroll.setHorizontalScrollBarEnabled(false);
        toolbar = row(); toolbar.setPadding(dp(5),dp(2),dp(5),dp(2)); toolbar.setBackgroundColor(Color.WHITE);
        String[][] tools = {{"↶","undo"},{"↷","redo"},{"↖","select"},{"✋","pan"},{"T","text"},{"✎","draw"},{"▱","highlight"},{"▰","erase"},{"▧","image"}};
        for (String[] item : tools) toolbar.addView(button(item[0], () -> {if(item[1].equals("undo"))pageView.undo();else if(item[1].equals("redo"))pageView.redo();else chooseTool(item[1]);}));
        toolsScroll.addView(toolbar); root.addView(toolsScroll);
        HorizontalScrollView pageToolsScroll=new HorizontalScrollView(this);pageToolsScroll.setHorizontalScrollBarEnabled(false);pdfPageTools=row();pdfPageTools.setPadding(dp(5),0,dp(5),0);pdfPageTools.setVisibility(View.GONE);
        pdfPageTools.addView(button("Add page",this::addPdfPage));pdfPageTools.addView(button("Duplicate",this::duplicatePdfPage));pdfPageTools.addView(button("Delete",this::deletePdfPage));pdfPageTools.addView(button("Move left",()->movePdfPage(-1)));pdfPageTools.addView(button("Move right",()->movePdfPage(1)));pageToolsScroll.addView(pdfPageTools);root.addView(pageToolsScroll);

        textEntryRow = row(); textEntryRow.setPadding(dp(10),dp(4),dp(10),dp(4)); textEntryRow.setVisibility(View.GONE);
        textEntry = new EditText(this); textEntry.setSingleLine(true); textEntry.setHint("Type text to place on the page");
        textEntryRow.addView(textEntry,new LinearLayout.LayoutParams(0,dp(46),1)); textEntryRow.addView(button("Place",this::placeText)); root.addView(textEntryRow);

        pageScroll = new ScrollView(this); pageScroll.setFillViewport(true); pageScroll.setBackgroundColor(Color.rgb(232,235,243));
        FrameLayout pageContainer = new FrameLayout(this);
        pageView = new NativePageView(); pageContainer.addView(pageView,new FrameLayout.LayoutParams(-1,-1));
        documentEditor = new EditText(this); documentEditor.setGravity(Gravity.TOP|Gravity.START); documentEditor.setTextSize(15); documentEditor.setPadding(dp(22),dp(18),dp(22),dp(18)); documentEditor.setBackgroundColor(Color.WHITE); documentEditor.setVisibility(View.GONE); documentEditor.setMinHeight(dp(600)); pageContainer.addView(documentEditor,new FrameLayout.LayoutParams(-1,-1));
        pageScroll.addView(pageContainer,new ScrollView.LayoutParams(-1,ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(pageScroll,new LinearLayout.LayoutParams(-1,0,1));

        LinearLayout bottom = row(); bottom.setPadding(dp(10),dp(3),dp(10),dp(3)); bottom.setBackgroundColor(Color.WHITE);
        bottom.addView(button("‹",() -> changePage(-1)));
        pageLabel = label("Page 1",12,Color.DKGRAY); pageLabel.setGravity(Gravity.CENTER); bottom.addView(pageLabel,new LinearLayout.LayoutParams(0,dp(44),1));
        bottom.addView(button("›",() -> changePage(1))); bottom.addView(button("−",() -> setZoom(zoom-.15f)));
        bottom.addView(button("Fit",() -> setZoom(1f))); bottom.addView(button("+",() -> setZoom(zoom+.15f)));
        bottom.addView(button("Color",()->{pageView.cycleColor();}));
        root.addView(bottom);
        status = label("Files and edits stay on this device",11,Color.GRAY); status.setPadding(dp(14),dp(7),dp(14),dp(7)); root.addView(status);
        setContentView(root);
    }

    private GradientDrawable shape(int color, int radius, int stroke) {
        GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius));
        if (stroke != 0) d.setStroke(dp(1), stroke); return d;
    }
    private TextView homeText(String text, int size, int color, boolean bold) {
        TextView t = label(text, size, color); if (bold) t.setTypeface(null, 1); return t;
    }
    private void showHome() {
        showingHome = true;
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(Color.rgb(250,250,252));
        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setPadding(dp(22),dp(18),dp(22),dp(28));
        LinearLayout brand = row(); TextView logo = homeText("forma.",25,Color.rgb(35,44,66),true); brand.addView(logo,new LinearLayout.LayoutParams(0,dp(52),1));
        TextView local = homeText("ON DEVICE",10,ink,true); local.setPadding(dp(10),dp(8),dp(10),dp(8)); local.setBackground(shape(0xFFEFF0FF,20,0)); brand.addView(local); page.addView(brand);
        TextView kicker = homeText("UNIVERSAL FILE EDITOR",10,ink,true); kicker.setPadding(0,dp(25),0,dp(9)); page.addView(kicker);
        TextView heading = homeText("Make every file\nfeel editable.",35,Color.rgb(35,44,66),true); heading.setLineSpacing(dp(1),1f); page.addView(heading);
        TextView copy = homeText("One focused canvas for documents, images, PDFs, and the ideas that need a final pass.",15,Color.rgb(108,117,137),false); copy.setLineSpacing(dp(4),1f); LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2);cp.topMargin=dp(14);page.addView(copy,cp);
        Button open=button("↑   Open a file",this::openPicker); open.setTextSize(15);open.setTypeface(null,1);open.setBackground(shape(0xFF5C53E2,14,0));open.setTextColor(Color.WHITE);LinearLayout.LayoutParams bp=new LinearLayout.LayoutParams(-1,dp(54));bp.topMargin=dp(22);page.addView(open,bp);
        Button fresh=button("＋   New document",this::newDocument);fresh.setTextSize(15);LinearLayout.LayoutParams fp=new LinearLayout.LayoutParams(-1,dp(52));fp.topMargin=dp(10);page.addView(fresh,fp);
        LinearLayout formats=row();formats.setPadding(0,dp(18),0,dp(24));for(String f:new String[]{"PDF","DOCX","PNG","JPG","TXT","MD"}){TextView chip=homeText(f,10,Color.rgb(94,103,126),true);chip.setPadding(dp(7),dp(6),dp(7),dp(6));formats.addView(chip);}page.addView(formats);
        LinearLayout recentHead=row();TextView recent=homeText("Recent files",23,Color.rgb(35,44,66),true);recentHead.addView(recent,new LinearLayout.LayoutParams(0,-2,1));TextView all=homeText("SEE ALL",10,ink,true);all.setOnClickListener(v->showRecent());recentHead.addView(all);page.addView(recentHead);
        String stored=getSharedPreferences("forma-local",MODE_PRIVATE).getString("recent","");int count=0;
        for(String item:stored.split("\n")){if(item.isEmpty()||count>=6)continue;String[] parts=item.split("\t",2);String name=parts.length>1?parts[1]:"Document";String locator=parts[0];LinearLayout card=row();card.setPadding(dp(13),dp(11),dp(10),dp(11));card.setBackground(shape(Color.WHITE,15,0xFFE8EAF1));LinearLayout.LayoutParams cardp=new LinearLayout.LayoutParams(-1,-2);cardp.topMargin=dp(9);page.addView(card,cardp);
            TextView icon=homeText(name.toLowerCase(Locale.ROOT).endsWith(".pdf")?"PDF":"▤",11,ink,true);icon.setGravity(Gravity.CENTER);icon.setBackground(shape(0xFFF0F1FF,11,0xFFDCDFFF));card.addView(icon,new LinearLayout.LayoutParams(dp(44),dp(44)));
            LinearLayout detail=new LinearLayout(this);detail.setOrientation(LinearLayout.VERTICAL);detail.setPadding(dp(11),0,0,0);TextView nm=homeText(name,14,Color.rgb(44,52,72),true);nm.setSingleLine(true);nm.setEllipsize(android.text.TextUtils.TruncateAt.MIDDLE);detail.addView(nm);detail.addView(homeText("SAVED ON THIS DEVICE",9,Color.rgb(137,145,163),true));card.addView(detail,new LinearLayout.LayoutParams(0,-2,1));card.setOnClickListener(v->{try{if(locator.startsWith("forma-local://")){String localName=locator.substring("forma-local://".length());loadFile(Uri.fromFile(new File(new File(getFilesDir(),"projects"),localName)));}else loadFile(Uri.parse(locator));}catch(Exception e){toast("Open this file again from device storage.");}});count++;}
        if(count==0){LinearLayout empty=new LinearLayout(this);empty.setOrientation(LinearLayout.VERTICAL);empty.setGravity(Gravity.CENTER);empty.setPadding(dp(12),dp(23),dp(12),dp(23));empty.setBackground(shape(Color.WHITE,16,0xFFE8EAF1));LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(-1,-2);ep.topMargin=dp(13);page.addView(empty,ep);empty.addView(homeText("▧",26,ink,true));empty.addView(homeText("A fresh canvas awaits",16,Color.rgb(44,52,72),true));TextView hint=homeText("Open your first file or start from a blank document.",12,Color.rgb(125,133,151),false);hint.setGravity(Gravity.CENTER);empty.addView(hint);}
        TextView foot=homeText("Local-first editing · Your files stay on this device",11,Color.rgb(137,145,163),false);foot.setGravity(Gravity.CENTER);LinearLayout.LayoutParams fop=new LinearLayout.LayoutParams(-1,dp(44));fop.topMargin=dp(16);page.addView(foot,fop);
        scroll.addView(page);setContentView(scroll);
    }
    private void showEditor(){showingHome=false;setContentView(root);}

    private void chooseTool(String next) {
        tool = next;
        textEntryRow.setVisibility("text".equals(next) ? View.VISIBLE : View.GONE);
        if ("image".equals(next)) { tool = "select"; insertImagePending=true; openPicker("image/*"); }
        status.setText("Tool: " + next.substring(0,1).toUpperCase(Locale.ROOT) + next.substring(1));
    }
    private void openPicker() { openPicker("*/*"); }
    private void openPicker(String type) {
        Intent intent = new Intent("android.intent.action.OPEN_DOCUMENT"); intent.setType(type); intent.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(Intent.createChooser(intent,"Choose a file on this device"),OPEN_FILE);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request,result,data);
        boolean insertImage=request==OPEN_FILE&&insertImagePending;
        if(request==OPEN_FILE)insertImagePending=false;
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        if (request == OPEN_FILE && insertImage) { try{byte[] bytes=readAll(data.getData());Bitmap image=BitmapFactory.decodeByteArray(bytes,0,bytes.length);if(image==null)throw new Exception("Unsupported image");pageView.addImage(image);}catch(Exception e){toast("Could not insert image: "+e.getMessage());} }
        else if (request == OPEN_FILE) { try{getContentResolver().getClass().getMethod("takePersistableUriPermission",Uri.class,int.class).invoke(getContentResolver(),data.getData(),data.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION));}catch(Exception ignored){} loadFile(data.getData()); }
        else if (request == SAVE_FILE) writeExport(data.getData());
    }
    private void loadFile(Uri uri) {
        sourceUri = uri;
        fileName = queryName(uri); String lower=fileName.toLowerCase(Locale.ROOT);
        closePdf(); background=null; textContent=""; pageIndex=0; pdfPages=0; pdfSourcePages.clear();pdfPageMarks.clear();pageView.clear();
        try {
            byte[] bytes = readAll(uri);
            if (lower.endsWith(".pdf")) { fileKind="pdf"; openPdf(uri); }
            else if (isImage(lower)) { fileKind="image"; background=BitmapFactory.decodeByteArray(bytes,0,bytes.length); if(background==null)throw new Exception("Android could not decode this image"); }
            else if (lower.endsWith(".docx")) { fileKind="document"; textContent=readDocx(bytes); }
            else if (isText(lower)) { fileKind="text"; textContent=new String(bytes,Charset.forName("UTF-8")); if(lower.endsWith(".html")||lower.endsWith(".htm"))textContent=textContent.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>","").replaceAll("<[^>]+>","").replace("&nbsp;"," ").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">"); }
            else throw new Exception("Forma cannot edit this file type yet");
            title.setText(fileName); documentEditor.setText(textContent); boolean editableText=fileKind.equals("text")||fileKind.equals("document");documentEditor.setVisibility(editableText?View.VISIBLE:View.GONE);pageView.setVisibility(editableText?View.GONE:View.VISIBLE);pdfPageTools.setVisibility(fileKind.equals("pdf")?View.VISIBLE:View.GONE);rememberRecent(uri,fileName);showEditor();renderSurface(); status.setText("Opened locally · changes remain on this device");
        } catch (Exception e) { toast("Could not open file: "+e.getMessage()); }
    }
    private boolean isImage(String n) { return n.endsWith(".png")||n.endsWith(".jpg")||n.endsWith(".jpeg")||n.endsWith(".webp")||n.endsWith(".gif")||n.endsWith(".bmp"); }
    private boolean isText(String n) { return n.endsWith(".txt")||n.endsWith(".md")||n.endsWith(".markdown")||n.endsWith(".html")||n.endsWith(".htm")||n.endsWith(".json")||n.endsWith(".csv")||n.endsWith(".xml")||n.endsWith(".css")||n.endsWith(".js")||n.endsWith(".java")||n.endsWith(".yaml")||n.endsWith(".yml"); }
    private byte[] readAll(Uri uri) throws Exception { InputStream in=getContentResolver().openInputStream(uri); if(in==null)throw new Exception("No file data"); ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] b=new byte[8192]; int n; while((n=in.read(b))!=-1)out.write(b,0,n); in.close(); return out.toByteArray(); }
    private String queryName(Uri uri) { String result=uri.getLastPathSegment(); android.database.Cursor c=getContentResolver().query(uri,null,null,null,null); if(c!=null){try{if(c.moveToFirst()){int i=c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);if(i>=0)result=c.getString(i);}}finally{c.close();}} return result==null?"Document":result; }
    private void rememberRecent(Uri uri,String name){String value=uri.toString()+"\t"+name;android.content.SharedPreferences p=getSharedPreferences("forma-local",MODE_PRIVATE);String stored=p.getString("recent","");ArrayList<String> items=new ArrayList<>();for(String item:stored.split("\n"))if(!item.isEmpty()&&!item.startsWith(uri.toString()+"\t"))items.add(item);items.add(0,value);while(items.size()>12)items.remove(items.size()-1);p.edit().putString("recent",android.text.TextUtils.join("\n",items)).apply();}
    private void showRecent(){String stored=getSharedPreferences("forma-local",MODE_PRIVATE).getString("recent","");ArrayList<String> items=new ArrayList<>();for(String item:stored.split("\n"))if(!item.isEmpty())items.add(item);if(items.isEmpty()){toast("Open a file to add it to Recent");return;}String[] names=new String[items.size()];for(int i=0;i<items.size();i++){String[] parts=items.get(i).split("\t",2);names[i]=parts.length>1?parts[1]:parts[0];}new AlertDialog.Builder(this).setTitle("Recent files on this device").setItems(names,(d,index)->{try{String locator=items.get(index).split("\t",2)[0];if(locator.startsWith("forma-local://")){String localName=locator.substring("forma-local://".length());File file=new File(new File(getFilesDir(),"projects"),localName);if(!file.getCanonicalPath().startsWith(new File(getFilesDir(),"projects").getCanonicalPath()+File.separator))throw new Exception("Invalid local project path");loadFile(Uri.fromFile(file));}else loadFile(Uri.parse(locator));}catch(Exception e){toast("That file is no longer available. Open it again from device storage.");}}).show();}
    private void newDocument(){closePdf();sourceUri=null;background=null;pdfPages=0;pdfSourcePages.clear();pdfPageMarks.clear();pageIndex=0;fileKind="text";fileName="Untitled document.txt";textContent="";pageView.clear();title.setText(fileName);documentEditor.setText("");documentEditor.setVisibility(View.VISIBLE);pageView.setVisibility(View.GONE);pdfPageTools.setVisibility(View.GONE);showEditor();renderSurface();status.setText("New local document · use Save to keep a copy");}
    private String readDocx(byte[] data) throws Exception {
        java.util.zip.ZipInputStream zip=new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(data)); java.util.zip.ZipEntry entry; ByteArrayOutputStream xml=new ByteArrayOutputStream();
        while((entry=zip.getNextEntry())!=null){if("word/document.xml".equals(entry.getName())){byte[] b=new byte[4096];int n;while((n=zip.read(b))!=-1)xml.write(b,0,n);break;}} zip.close();
        if(xml.size()==0)throw new Exception("Invalid DOCX document"); String s=new String(xml.toByteArray(),Charset.forName("UTF-8")); s=s.replaceAll("(?i)</w:p>","\n").replaceAll("<w:tab[^>]*/>","\t").replaceAll("<[^>]+>","").replace("&amp;","&").replace("&lt;","<").replace("&gt;",">").replace("&quot;","").replace("&apos;", "'"); return s;
    }
    private void openPdf(Uri uri) throws Exception {
        ParcelFileDescriptor descriptor=getContentResolver().openFileDescriptor(uri,"r"); if(descriptor==null)throw new Exception("Cannot read PDF");
        Class<?> type=Class.forName("android.graphics.pdf.PdfRenderer"); Constructor<?> constructor=type.getConstructor(ParcelFileDescriptor.class); pdfRenderer=constructor.newInstance(descriptor);
        int pageCount=(Integer)type.getMethod("getPageCount").invoke(pdfRenderer);for(int i=0;i<pageCount;i++){pdfSourcePages.add(i);pdfPageMarks.add(new ArrayList<>());}pdfPages=pdfSourcePages.size();renderPdfPage();
    }
    private void renderPdfPage() throws Exception {
        if(pdfRenderer==null||pdfSourcePages.isEmpty())return;int source=pdfSourcePages.get(pageIndex);background=source<0?Bitmap.createBitmap(816,1155,Bitmap.Config.ARGB_8888):renderSourcePage(source);if(source<0)background.eraseColor(Color.WHITE);pageView.loadMarks(pdfPageMarks.get(pageIndex));
    }
    private Bitmap renderSourcePage(int source) throws Exception {Method open=pdfRenderer.getClass().getMethod("openPage",int.class);Object page=open.invoke(pdfRenderer,source);int w=(Integer)page.getClass().getMethod("getWidth").invoke(page),h=(Integer)page.getClass().getMethod("getHeight").invoke(page);float factor=Math.min(2f,1200f/Math.max(w,h));Bitmap result=Bitmap.createBitmap(Math.max(1,(int)(w*factor)),Math.max(1,(int)(h*factor)),Bitmap.Config.ARGB_8888);page.getClass().getMethod("render",Bitmap.class,Rect.class,android.graphics.Matrix.class,int.class).invoke(page,result,null,null,1);page.getClass().getMethod("close").invoke(page);return result;}
    private void closePdf(){ if(pdfRenderer!=null){try{pdfRenderer.getClass().getMethod("close").invoke(pdfRenderer);}catch(Exception ignored){} pdfRenderer=null;} }
    private void changePage(int delta){ if(pdfPages==0)return; int next=Math.max(0,Math.min(pdfPages-1,pageIndex+delta)); if(next==pageIndex)return;saveCurrentPageMarks();pageIndex=next;try{renderPdfPage();renderSurface();}catch(Exception e){toast("Could not render page");} }
    private void saveCurrentPageMarks(){if(fileKind.equals("pdf")&&pageIndex>=0&&pageIndex<pdfPageMarks.size())pdfPageMarks.set(pageIndex,pageView.copyMarks());}
    private void addPdfPage(){saveCurrentPageMarks();pdfSourcePages.add(pageIndex+1,-1);pdfPageMarks.add(pageIndex+1,new ArrayList<>());pageIndex++;pdfPages=pdfSourcePages.size();try{renderPdfPage();renderSurface();}catch(Exception ignored){}}
    private void duplicatePdfPage(){if(pdfPages==0)return;saveCurrentPageMarks();pdfSourcePages.add(pageIndex+1,pdfSourcePages.get(pageIndex));ArrayList<Mark> copies=new ArrayList<>();for(Mark mark:pdfPageMarks.get(pageIndex))copies.add(mark.copy());pdfPageMarks.add(pageIndex+1,copies);pageIndex++;pdfPages=pdfSourcePages.size();try{renderPdfPage();renderSurface();}catch(Exception ignored){}}
    private void deletePdfPage(){if(pdfPages<=1){toast("A PDF must keep at least one page");return;}pdfSourcePages.remove(pageIndex);pdfPageMarks.remove(pageIndex);pdfPages=pdfSourcePages.size();pageIndex=Math.min(pageIndex,pdfPages-1);try{renderPdfPage();renderSurface();}catch(Exception ignored){}}
    private void movePdfPage(int delta){int next=pageIndex+delta;if(next<0||next>=pdfPages)return;saveCurrentPageMarks();Integer source=pdfSourcePages.remove(pageIndex);pdfSourcePages.add(next,source);ArrayList<Mark> marks=pdfPageMarks.remove(pageIndex);pdfPageMarks.add(next,marks);pageIndex=next;try{renderPdfPage();renderSurface();}catch(Exception ignored){}}
    private void setZoom(float next){zoom=Math.max(.4f,Math.min(2.5f,next)); if(pageView!=null)pageView.invalidate();}
    private void renderSurface(){ if(pageView!=null){pageView.invalidate(); pageLabel.setText(pdfPages>0?"Page "+(pageIndex+1)+" of "+pdfPages:"Page 1");} }
    private void placeText(){String value=textEntry.getText().toString().trim();if(value.isEmpty()){toast("Type some text first");return;}pageView.addText(value);textEntry.setText("");textEntryRow.setVisibility(View.GONE);tool="select";}
    private void saveLocally(){
        try{File folder=new File(getFilesDir(),"projects");if(!folder.exists()&&!folder.mkdirs())throw new Exception("Cannot create local project folder");String safe=fileName.replaceAll("[^A-Za-z0-9._-]","_");File target=new File(folder,safe);
            if((fileKind.equals("text")||fileKind.equals("document"))&&documentEditor.getVisibility()==View.VISIBLE){FileOutputStream out=new FileOutputStream(target);out.write(documentEditor.getText().toString().getBytes(Charset.forName("UTF-8")));out.close();}
            else if(sourceUri!=null){InputStream in=getContentResolver().openInputStream(sourceUri);FileOutputStream out=new FileOutputStream(target);byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);in.close();out.close();}
            FileOutputStream project=new FileOutputStream(new File(folder,safe+".forma.json"));String json="{\"name\":\""+escape(fileName)+"\",\"kind\":\""+fileKind+"\",\"text\":\""+escape(documentEditor.getText().toString())+"\",\"annotations\":"+pageView.annotationsJson()+"}";project.write(json.getBytes(Charset.forName("UTF-8")));project.close();rememberRecent(Uri.parse("forma-local://"+safe),fileName);status.setText("Saved on this device · "+target.getAbsolutePath());toast("Saved locally");
        }catch(Exception e){toast("Save failed: "+e.getMessage());}
    }

    private void showExports(){
        final String[] names={"Original file","Edited PDF","PNG image","Plain text","HTML document","Forma project (JSON)"}; final String[] formats={"original","pdf","png","txt","html","json"};
        new AlertDialog.Builder(this).setTitle("Export or save a copy").setItems(names,(d,which)->{exportFormat=formats[which];String mime=exportFormat.equals("pdf")?"application/pdf":exportFormat.equals("png")?"image/png":exportFormat.equals("txt")?"text/plain":exportFormat.equals("html")?"text/html":exportFormat.equals("json")?"application/json":"*/*";Intent i=new Intent("android.intent.action.CREATE_DOCUMENT");i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(mime);i.putExtra("android.intent.extra.TITLE",exportName(exportFormat));startActivityForResult(i,SAVE_FILE);}).show();
    }
    private String exportName(String format){String base=fileName.replaceFirst("\\.[^.]+$","");if(format.equals("original"))return fileName;return base+(format.equals("json")?".forma.json":"."+format);}
    private void writeExport(Uri target){
        try{OutputStream out=getContentResolver().openOutputStream(target,"w");if(out==null)throw new Exception("Could not create output file");
            if(exportFormat.equals("original")&&sourceUri!=null){InputStream in=getContentResolver().openInputStream(sourceUri);byte[] b=new byte[8192];int n;while((n=in.read(b))!=-1)out.write(b,0,n);in.close();}
            else if(exportFormat.equals("png")){pageView.snapshot().compress(Bitmap.CompressFormat.PNG,100,out);}
            else if(exportFormat.equals("txt")){out.write((fileKind.equals("text")||fileKind.equals("document")?documentEditor.getText().toString():"").getBytes(Charset.forName("UTF-8")));}
            else if(exportFormat.equals("html")){String html="<!doctype html><meta charset=\"utf-8\"><title>"+escape(fileName)+"</title><pre>"+escape(documentEditor.getText().toString())+"</pre>";out.write(html.getBytes(Charset.forName("UTF-8")));}
            else if(exportFormat.equals("json")){String json="{\"name\":\""+escape(fileName)+"\",\"kind\":\""+fileKind+"\",\"text\":\""+escape(documentEditor.getText().toString())+"\",\"page\":"+(pageIndex+1)+",\"annotations\":"+pageView.annotationsJson()+"}";out.write(json.getBytes(Charset.forName("UTF-8")));}
            else if(exportFormat.equals("pdf")){writePdf(out);}
            else throw new Exception("Choose a file before exporting"); out.close();status.setText("Saved "+exportName(exportFormat)+" on this device");toast("Export saved");
        }catch(Exception e){toast("Export failed: "+e.getMessage());}
    }
    private void writePdf(OutputStream out) throws Exception {
        Class<?> pdf=Class.forName("android.graphics.pdf.PdfDocument"), info=Class.forName("android.graphics.pdf.PdfDocument$PageInfo$Builder");
        Object document=pdf.newInstance();int count=fileKind.equals("pdf")?pdfSourcePages.size():1;saveCurrentPageMarks();
        for(int i=0;i<count;i++){Bitmap image;if(fileKind.equals("pdf")){int source=pdfSourcePages.get(i);image=source<0?Bitmap.createBitmap(816,1155,Bitmap.Config.ARGB_8888):renderSourcePage(source);if(source<0)image.eraseColor(Color.WHITE);}else image=pageView.snapshot();int w=image.getWidth(),h=image.getHeight();Object builder=info.getConstructor(int.class,int.class,int.class).newInstance(Math.max(w,1),Math.max(h,1),i+1);Object pageInfo=info.getMethod("create").invoke(builder);Object page=pdf.getMethod("startPage",Class.forName("android.graphics.pdf.PdfDocument$PageInfo")).invoke(document,pageInfo);Canvas canvas=(Canvas)page.getClass().getMethod("getCanvas").invoke(page);if(fileKind.equals("pdf")){canvas.drawBitmap(image,0,0,null);pageView.drawMarks(canvas,pdfPageMarks.get(i));}else canvas.drawBitmap(image,0,0,null);pdf.getMethod("finishPage",Class.forName("android.graphics.pdf.PdfDocument$Page")).invoke(document,page);}
        pdf.getMethod("writeTo",OutputStream.class).invoke(document,out);pdf.getMethod("close").invoke(document);
    }
    private String escape(String s){return s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","").replace("<","&lt;").replace(">","&gt;").replace("&","&amp;");}
    private void toast(String value){Toast.makeText(this,value,Toast.LENGTH_SHORT).show();}

    private class NativePageView extends View {
        private final ArrayList<Mark> marks=new ArrayList<>(); private final ArrayList<ArrayList<Mark>> undo=new ArrayList<>(),redo=new ArrayList<>(); private Mark liveMark; private float downX,downY,scale=1f,offsetX,offsetY; private int colorIndex=0; private final int[] palette={0xFF5269E9,0xFFE85F71,0xFF2EA77A,0xFF9A5DD0,0xFF232B3D};
        NativePageView(){super(MainActivity.this);setLayerType(View.LAYER_TYPE_SOFTWARE,null);setBackgroundColor(Color.rgb(232,235,243));}
        void clear(){marks.clear();undo.clear();redo.clear();}
        void loadMarks(ArrayList<Mark> values){marks.clear();for(Mark mark:values)marks.add(mark.copy());undo.clear();redo.clear();invalidate();}
        ArrayList<Mark> copyMarks(){ArrayList<Mark> copy=new ArrayList<>();for(Mark m:marks)copy.add(m.copy());return copy;}
        void remember(){undo.add(copyMarks());if(undo.size()>30)undo.remove(0);redo.clear();}
        void undo(){if(undo.isEmpty())return;redo.add(copyMarks());marks.clear();marks.addAll(undo.remove(undo.size()-1));invalidate();}
        void redo(){if(redo.isEmpty())return;undo.add(copyMarks());marks.clear();marks.addAll(redo.remove(redo.size()-1));invalidate();}
        void cycleColor(){colorIndex=(colorIndex+1)%palette.length;invalidate();status.setText("Drawing color updated");}
        void addText(String text){remember();Mark m=new Mark();m.type="text";m.text=text;m.x=Math.max(30,getWidth()/(2*scale)-100);m.y=Math.max(40,getHeight()/(2*scale)-30);m.color=palette[colorIndex];marks.add(m);invalidate();}
        void addImage(Bitmap image){remember();Mark m=new Mark();m.type="image";m.image=image;m.x=40;m.y=50;marks.add(m);invalidate();}
        Bitmap snapshot(){Bitmap b=Bitmap.createBitmap(Math.max(1,getWidth()),Math.max(1,getHeight()),Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);draw(c);return b;}
        String annotationsJson(){StringBuilder b=new StringBuilder("[");for(int i=0;i<marks.size();i++){Mark m=marks.get(i);if(i>0)b.append(',');b.append("{\"type\":\"").append(m.type).append("\",\"text\":\"").append(escape(m.text)).append("\",\"x\":").append(m.x).append(",\"y\":").append(m.y).append("}");}return b.append(']').toString();}
        void drawMarks(Canvas canvas,ArrayList<Mark> values){for(Mark mark:values)drawMark(canvas,mark);}
        @Override protected void onDraw(Canvas canvas){super.onDraw(canvas);float availableW=getWidth()-dp(28),availableH=getResources().getDisplayMetrics().heightPixels-dp(220);float bw=background==null?816:background.getWidth(),bh=background==null?1155:background.getHeight();scale=Math.max(.05f,Math.min(1.2f,Math.min(availableW/bw,availableH/bh)))*zoom;float pw=bw*scale,ph=bh*scale;offsetX=(getWidth()-pw)/2f;offsetY=dp(14);Paint p=new Paint(3);p.setColor(Color.WHITE);canvas.drawRoundRect(new RectF(offsetX-dp(3),offsetY-dp(3),offsetX+pw+dp(3),offsetY+ph+dp(3)),dp(5),dp(5),p);canvas.save();canvas.translate(offsetX,offsetY);canvas.scale(scale,scale);if(background!=null)canvas.drawBitmap(background,0,0,null);else drawTextPage(canvas);for(Mark m:marks)drawMark(canvas,m);if(liveMark!=null)drawMark(canvas,liveMark);canvas.restore();}
        @Override protected void onMeasure(int widthSpec,int heightSpec){int width=MeasureSpec.getSize(widthSpec);float bw=background==null?816:background.getWidth(),bh=background==null?1155:background.getHeight();float fit=Math.min(1f,(width-dp(28))/Math.max(1,bw))*zoom;int height=Math.max(dp(500),(int)(bh*fit)+dp(30));setMeasuredDimension(width,height);}
        private void drawTextPage(Canvas c){Paint p=new Paint(3);p.setColor(Color.rgb(31,41,55));p.setTextSize(24);p.setTypeface(android.graphics.Typeface.MONOSPACE);String[] lines=textContent.split("\\n",-1);float y=55;for(String line:lines){for(int at=0;at<line.length();at+=55){c.drawText(line.substring(at,Math.min(line.length(),at+55)),50,y,p);y+=32;}if(line.length()==0)y+=32;}}
        private void drawMark(Canvas c,Mark m){Paint p=new Paint(3);p.setColor(m.color);if(m.type.equals("text")){p.setTextSize(34);p.setTypeface(android.graphics.Typeface.create("sans-serif",0));String[] lines=m.text.split("\\n");for(int i=0;i<lines.length;i++)c.drawText(lines[i],m.x,m.y+i*40,p);}else if(m.type.equals("image")&&m.image!=null){float cap=550f/Math.max(m.image.getWidth(),m.image.getHeight());c.drawBitmap(m.image,null,new Rect((int)m.x,(int)m.y,(int)(m.x+m.image.getWidth()*cap),(int)(m.y+m.image.getHeight()*cap)),p);}else if(m.points!=null&&m.points.size()>1){p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(m.width);p.setStrokeCap(Paint.Cap.ROUND);p.setStrokeJoin(Paint.Join.ROUND);if(m.type.equals("highlight")){p.setColor(0x66F5D64A);p.setStrokeWidth(m.width*4);}else if(m.type.equals("erase")){p.setColor(Color.WHITE);p.setStrokeWidth(m.width*5);}Path path=new Path();path.moveTo(m.points.get(0)[0],m.points.get(0)[1]);for(int i=1;i<m.points.size();i++)path.lineTo(m.points.get(i)[0],m.points.get(i)[1]);c.drawPath(path,p);}}
        @Override public boolean onTouchEvent(MotionEvent e){float x=(e.getX()-offsetX)/scale,y=(e.getY()-offsetY)/scale;if(e.getAction()==MotionEvent.ACTION_DOWN){downX=x;downY=y;if(tool.equals("draw")||tool.equals("highlight")||tool.equals("erase")){remember();liveMark=new Mark();liveMark.type=tool;liveMark.color=palette[colorIndex];liveMark.width=tool.equals("highlight")?10:4;liveMark.points=new ArrayList<>();liveMark.points.add(new float[]{x,y});invalidate();}return true;}if(e.getAction()==MotionEvent.ACTION_MOVE&&liveMark!=null){liveMark.points.add(new float[]{x,y});invalidate();return true;}if(e.getAction()==MotionEvent.ACTION_UP){if(liveMark!=null){if(tool.equals("erase")&&liveMark.points.size()==1){liveMark=null;eraseAt(x,y);}else{marks.add(liveMark);liveMark=null;}invalidate();}else if(tool.equals("text")){textEntry.requestFocus();}else if(tool.equals("select")){moveNearest(downX,downY,x,y);}return true;}return true;}
        private void eraseAt(float x,float y){remember();for(int i=marks.size()-1;i>=0;i--){Mark m=marks.get(i);if(m.type.equals("text")&&Math.abs(x-m.x)<250&&Math.abs(y-m.y)<50){marks.remove(i);invalidate();return;}}}
        private void moveNearest(float x0,float y0,float x1,float y1){for(int i=marks.size()-1;i>=0;i--){Mark m=marks.get(i);if(m.type.equals("text")&&Math.abs(x0-m.x)<250&&Math.abs(y0-m.y)<55){remember();m.x=x1;m.y=y1;invalidate();return;}}}
    }
    private static class Mark {String type="draw",text="";float x,y,width=4;int color=Color.BLUE;ArrayList<float[]> points;Bitmap image;Mark copy(){Mark m=new Mark();m.type=type;m.text=text;m.x=x;m.y=y;m.width=width;m.color=color;m.points=points==null?null:new ArrayList<>(points);m.image=image;return m;}}

    @Override public void onBackPressed(){if(textEntryRow.getVisibility()==View.VISIBLE){textEntryRow.setVisibility(View.GONE);tool="select";}else if(!showingHome){showHome();}else super.onBackPressed();}
    @Override protected void onDestroy(){closePdf();super.onDestroy();}
}
