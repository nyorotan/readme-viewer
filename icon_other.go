//go:build !windows

package main

import (
	webview "github.com/webview/webview_go"
)

// setWindowIcon は非 Windows 環境では何もしない（アイコンはデフォルトのまま）。
func setWindowIcon(w webview.WebView) {
	// Windows 以外のプラットフォームでは未実装
}
