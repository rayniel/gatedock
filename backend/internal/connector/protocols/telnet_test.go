package protocols

import (
	"bytes"
	"testing"
)

func TestNormalizeTelnetInput(t *testing.T) {
	for _, tc := range []struct {
		name string
		in   []byte
		want []byte
	}{
		{"backspace", []byte{0x7f}, []byte{0x08}},
		{"existing backspace", []byte{0x08}, []byte{0x08}},
		{"text with backspaces", []byte("ab\x7fc\x7f\r"), []byte("ab\x08c\x08\r")},
		{"delete and arrows", []byte("\x1b[3~\x1b[A\x1b[D"), []byte("\x1b[3~\x1b[A\x1b[D")},
		{"UTF-8 text", []byte("\xe4\xb8\xad\xe6\x96\x87\r\n"), []byte("\xe4\xb8\xad\xe6\x96\x87\r\n")},
		{"empty", nil, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := normalizeTelnetInput(tc.in, "bs"); !bytes.Equal(got, tc.want) {
				t.Fatalf("normalizeTelnetInput() = %q, want %q", got, tc.want)
			}
		})
	}

}

func TestTelnetBackspaceDefaultPreservesInput(t *testing.T) {
	for _, mode := range []string{"", "del"} {
		input := []byte("ab\x7f\x08\x1b[3~")
		want := append([]byte(nil), input...)
		if got := normalizeTelnetInput(input, mode); !bytes.Equal(got, want) {
			t.Fatalf("mode %q changed input: %q", mode, got)
		}
	}
}
