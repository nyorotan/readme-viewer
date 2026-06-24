package handler

import (
	"bytes"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"
)

// MarkdownToHTML はマークダウンをHTMLに変換
func MarkdownToHTML(content []byte) []byte {
	md := goldmark.New(
		goldmark.WithExtensions(
			extension.NewTable(),
		),
	)
	var buf bytes.Buffer
	if err := md.Convert(content, &buf); err != nil {
		return []byte("<p>Parse error</p>")
	}
	return buf.Bytes()
}

// ExtractHeadings はマークダウンから見出しを抽出
func ExtractHeadings(content []byte) []Heading {
	md := goldmark.New(
		goldmark.WithExtensions(
			extension.NewTable(),
		),
	)
	doc := md.Parser().Parse(text.NewReader(content))

	var headings []Heading
	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}

		heading, ok := n.(*ast.Heading)
		if !ok {
			return ast.WalkContinue, nil
		}

		title := extractText(heading)
		headings = append(headings, Heading{
			Level: heading.Level,
			Title: title,
			ID:    slugify(title),
		})

		return ast.WalkContinue, nil
	})

	return headings
}

// extractText はノードからテキストを抽出
func extractText(n ast.Node) string {
	var buf bytes.Buffer
	for child := n.FirstChild(); child != nil; child = child.NextSibling() {
		if text, ok := child.(*ast.Text); ok {
			buf.Write(text.Segment.Value(nil))
		}
	}
	return buf.String()
}

// slugify は見出しをURL friendlyに変換
func slugify(s string) string {
	s = strings.ToLower(s)
	s = regexp.MustCompile(`[^\w\s-]`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, "-")
	return s
}

type Heading struct {
	Level int
	Title string
	ID    string
}
