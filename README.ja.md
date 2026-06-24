🌐 [English](./README.md)|**日本語**

# README Viewer

## 概要

README Viewer は、`README.md` などの Markdown ファイルを表示するためのシンプルなアプリです。編集機能はありません。  
`go:embed` を用いて静的リソース（HTML・CSS・JS・Markdown 本体）をバイナリに埋め込む為、単一ファイルにまとまります。  
OSごとに内部で利用するレンダリングエンジンが異なります。（WindowsはEdge/WebView2、macOSはWebKit、LinuxはWebKitGTK）


自作アプリと一緒に配布することで、誰もが簡単に同じ見た目で、`README.md` を読めるようにすることが目的です。



## 主な機能

- **ファイル一覧・サイドバー**：同じディレクトリ内の `.md` ファイルを自動検出し、一覧から切り替え可能
- **リアルタイム検索**：本文検索・横断検索（複数ファイル）
- **ページナビゲーション**：戻る・進む・再読み込み
- **印刷**：現在表示中のファイル全体を印刷


## 前提条件

- Go 1.20 以降
- Mingw-w64等のgccコンパイラ（Windows）
- `github.com/webview/webview_go` がインストールされていること（`go mod tidy` で自動取得）
- Windows では、WebView2 Runtime がインストールされていること
- .md ファイルの転送に localhost:8080 を使用しているため、起動時にネットワークへのアクセス許可 を求められることがあります。


## 使い方

1. 起動すると、カレントディレクトリに `README.md` があればそれを表示します。存在しない場合は、同じディレクトリ内の最初の `.md` ファイルを表示します。
2. 実行時引数に Markdown ファイルを指定できます。
   - Windows: `readme-viewer.exe README.md`
   - Linux/macOS: `./readme-viewer README.md`
3. 左サイドバーで同じディレクトリ内の `.md` ファイルを切り替えられます。
4. 画面上部の検索バーで文字列検索、`横断検索` チェックで複数ファイルをまたいで検索できます。
5. メニューバーの **🖨 印刷** ボタンで現在のファイル全体を印刷できます。


## ビルド & 実行手順

### 準備

```bash
# リポジトリをクローン
git clone https://github.com/nyorotan/readme-viewer.git
cd readme-viewer

# 依存パッケージ取得
go mod tidy
```

### Windows

```cmd
# ビルド（単一実行ファイル生成）
set CGO_ENABLED=1
set GOOS=windows
set GOARCH=amd64
set CXX=x86_64-w64-mingw32-g++
set CC=x86_64-w64-mingw32-gcc
go build -trimpath -ldflags="-H windowsgui -s -w" -o readme-viewer.exe ./

# 実行
./readme-viewer.exe
```

### Linux

```bash
# ビルド（単一実行ファイル生成）
export CGO_ENABLED=1
export GOOS=linux
export GOARCH=amd64
go build -trimpath -ldflags="-s -w" -o readme-viewer ./

# 実行
./readme-viewer

```

## 埋め込みリソースについて

`static/` ディレクトリ以下の HTML・CSS・JS・画像・Markdown ファイルは以下のコードで埋め込まれます。

```go
//go:embed static
var staticFS embed.FS
```

`go:embed` により生成されたバイナリは 1 ファイルだけで配布可能です。


## トラブルシューティング

- Windows では WebView2 Runtime がないと起動しないことがあります。
- Linux では WebKitGTK などの依存関係が必要な場合があります。
- ビルドエラーが出る場合は、まず `go mod tidy` を実行してください。

## ライセンス

MIT License © 2026 nyorotan
