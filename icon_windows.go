//go:build windows

package main

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"

	webview "github.com/webview/webview_go"
)

var (
	user32           = syscall.NewLazyDLL("user32.dll")
	procSendMessageW = user32.NewProc("SendMessageW")
	procLoadImageW   = user32.NewProc("LoadImageW")
)

const (
	WM_SETICON      = 0x0080
	ICON_SMALL      = 0
	ICON_BIG        = 1
	IMAGE_ICON      = 1
	LR_LOADFROMFILE = 0x00000010
	LR_DEFAULTSIZE  = 0x00000040
)

// setWindowIcon は Windows 環境で Win32 API を使ってウィンドウアイコンを設定する。
func setWindowIcon(w webview.WebView) {
	hwnd := w.Window()
	if hwnd == nil {
		return
	}

	iconBytes, err := staticFS.ReadFile("static/zz.ico")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to read zz.ico from embed: %v\n", err)
		return
	}

	tmpFile, err := os.CreateTemp("", "webview_icon_*.ico")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to create temp file for icon: %v\n", err)
		return
	}
	tmpPath := tmpFile.Name()
	defer func() {
		tmpFile.Close()
		_ = os.Remove(tmpPath)
	}()

	if _, err := tmpFile.Write(iconBytes); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: failed to write icon to temp file: %v\n", err)
		return
	}
	tmpFile.Close()

	iconPathPtr, err := syscall.UTF16PtrFromString(tmpPath)
	if err != nil {
		return
	}

	hIcon, _, _ := procLoadImageW.Call(
		0,
		uintptr(unsafe.Pointer(iconPathPtr)),
		IMAGE_ICON,
		0,
		0,
		LR_LOADFROMFILE|LR_DEFAULTSIZE,
	)

	if hIcon != 0 {
		procSendMessageW.Call(uintptr(hwnd), WM_SETICON, ICON_SMALL, hIcon)
		procSendMessageW.Call(uintptr(hwnd), WM_SETICON, ICON_BIG, hIcon)
	}
}
