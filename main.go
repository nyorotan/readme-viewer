package main

import (
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"markdown-viewer/handler"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	webview "github.com/webview/webview_go"
)

//go:embed static
var staticFS embed.FS

var defaultFile = "README.md"

func findMarkdownFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var files []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.EqualFold(filepath.Ext(name), ".md") {
			files = append(files, name)
		}
	}
	return files, nil
}

func main() {
	if len(os.Args) > 1 {
		defaultFile = os.Args[1]
	} else {
		if _, err := os.Stat(defaultFile); os.IsNotExist(err) {
			files, err := findMarkdownFiles(".")
			if err != nil || len(files) == 0 {
				fmt.Fprintln(os.Stderr, "エラー: 表示対象の Markdown ファイル (.md) が見つかりません。")
				os.Exit(1)
			}
			defaultFile = files[0]
		}
	}

	addr := ":8080"
	subFS, err := fs.Sub(staticFS, "static")
	if err != nil {
		fmt.Fprintf(os.Stderr, "埋め込みリソースのロードに失敗しました: %v\n", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("/", http.FileServer(http.FS(subFS)))
	mux.HandleFunc("/api/markdown", handleMarkdown)
	mux.HandleFunc("/api/file", handleFile)
	mux.HandleFunc("/api/list", handleListMarkdownFiles)

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	go func() {
		fmt.Printf("README Viewer listening on http://127.0.0.1%s\n", addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}()

	if err := waitForServer("http://127.0.0.1" + addr + "/"); err != nil {
		fmt.Fprintf(os.Stderr, "Server startup failed: %v\n", err)
		os.Exit(1)
	}

	targetURL := fmt.Sprintf("http://127.0.0.1%s/?file=%s", addr, url.QueryEscape(defaultFile))

	w, err := createWebView()
	if err != nil {
		fmt.Fprintf(os.Stderr, "WebView の初期化に失敗したため、OS 既定のブラウザで開きます: %v\n", err)
		if openErr := openBrowser(targetURL); openErr != nil {
			fmt.Fprintf(os.Stderr, "OS 既定ブラウザの起動に失敗しました: %v\n", openErr)
			os.Exit(1)
		}
		fmt.Printf("Opened default browser: %s\n", targetURL)
		select {}
	}

	defer w.Destroy()

	w.SetTitle("README Viewer")
	w.SetSize(1280, 900, webview.Hint(webview.HintNone))

	w.Navigate(targetURL)
	w.Run()
}

func waitForServer(target string) error {
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(target)
		if err == nil {
			_ = resp.Body.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for server")
}

func createWebView() (webview.WebView, error) {
	var (
		w   webview.WebView
		err error
	)

	func() {
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("webview initialization failed: %v", r)
			}
		}()
		w = webview.New(true)
	}()

	if err != nil {
		return nil, err
	}
	if w == nil {
		return nil, fmt.Errorf("webview initialization returned nil")
	}

	return w, nil
}

func openBrowser(targetURL string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("cmd", "/c", "start", "", targetURL).Start()
	case "darwin":
		return exec.Command("open", targetURL).Start()
	case "linux":
		return exec.Command("xdg-open", targetURL).Start()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

func handleMarkdown(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		filePath = defaultFile
	}

	resolvedPath, err := resolveFilePath(filePath)
	if err != nil {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// goldmark でHTML変換
	html := handler.MarkdownToHTML(content)

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"html":%q}`, string(html))
}

func handleFile(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		http.Error(w, "Missing file parameter", http.StatusBadRequest)
		return
	}

	resolvedPath, err := resolveFilePath(filePath)
	if err != nil {
		http.Error(w, "Invalid file path", http.StatusBadRequest)
		return
	}

	content, err := os.ReadFile(resolvedPath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", contentTypeForPath(resolvedPath))
	_, _ = w.Write(content)
}

func handleListMarkdownFiles(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		filePath = defaultFile
	}

	dirPath := "."
	if resolvedPath, err := resolveFilePath(filePath); err == nil {
		dirPath = filepath.Dir(resolvedPath)
	} else if baseDir, err := resolveBaseDir(filePath); err == nil {
		dirPath = baseDir
	}

	entries, err := os.ReadDir(dirPath)
	if err != nil {
		http.Error(w, "Failed to read directory", http.StatusInternalServerError)
		return
	}

	var files []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.EqualFold(filepath.Ext(name), ".md") {
			files = append(files, name)
		}
	}

	if len(files) == 0 {
		files = append(files, filepath.Base(filePath))
	}
	sort.Strings(files)

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"files":[%s]}`, joinJSONString(files))
}

func resolveFilePath(filePath string) (string, error) {
	if filePath == "" {
		filePath = defaultFile
	}

	baseDirs := []string{}
	if wd, err := os.Getwd(); err == nil {
		baseDirs = append(baseDirs, filepath.Clean(wd))
	}
	if exePath, err := os.Executable(); err == nil {
		baseDirs = append(baseDirs, filepath.Clean(filepath.Dir(exePath)))
	}

	candidates := []string{filePath}
	for _, baseDir := range baseDirs {
		candidates = append(candidates, filepath.Join(baseDir, filePath))
	}

	for _, candidate := range candidates {
		cleaned := filepath.Clean(candidate)
		if !isSafePath(cleaned, baseDirs) {
			continue
		}
		if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
			return cleaned, nil
		}
	}

	return "", os.ErrNotExist
}

func isSafePath(candidate string, baseDirs []string) bool {
	for _, baseDir := range baseDirs {
		rel, err := filepath.Rel(baseDir, candidate)
		if err != nil {
			continue
		}
		if rel == "." {
			return true
		}
		if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			continue
		}
		return true
	}
	return false
}

func resolveBaseDir(filePath string) (string, error) {
	if filePath == "" {
		filePath = defaultFile
	}
	if filepath.IsAbs(filePath) {
		return filepath.Dir(filePath), nil
	}
	if wd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(wd, filePath)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return filepath.Dir(candidate), nil
		}
	}
	if exePath, err := os.Executable(); err == nil {
		candidate := filepath.Join(filepath.Dir(exePath), filePath)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return filepath.Dir(candidate), nil
		}
	}
	return filepath.Dir(filePath), nil
}

func contentTypeForPath(filePath string) string {
	switch strings.ToLower(filepath.Ext(filePath)) {
	case ".svg":
		return "image/svg+xml"
	case ".bmp":
		return "image/bmp"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".md", ".markdown":
		return "text/markdown; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}

func joinJSONString(values []string) string {
	if len(values) == 0 {
		return ""
	}
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, `"`+strings.ReplaceAll(value, `"`, `\"`)+`"`)
	}
	return strings.Join(parts, ",")
}
