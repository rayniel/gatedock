package guacd

import (
	"bytes"
	"testing"
)

func TestFilterTunnelInstructions(t *testing.T) {
	ping := "0.,4.ping,13.1731680000000;"
	key := "3.key,3.118,1.1;"
	blob := "4.blob,1.0,6.文,a.;x;"
	for _, tc := range []struct {
		name    string
		input   string
		forward string
		reply   string
	}{
		{"ping", ping, "", ping},
		{"ordinary input", key, key, ""},
		{"mixed instructions", ping + key + ping, key, ping + ping},
		{"Unicode and embedded delimiters", ping + blob, blob, ping},
		{"unknown tunnel instruction", "0.,3.foo;", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			forward, reply, err := FilterTunnelInstructions([]byte(tc.input))
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(forward, []byte(tc.forward)) || !bytes.Equal(reply, []byte(tc.reply)) {
				t.Fatalf("got forward %q, reply %q; want forward %q, reply %q", forward, reply, tc.forward, tc.reply)
			}
		})
	}
}

func TestFilterTunnelInstructionsRejectsIncompleteMessages(t *testing.T) {
	for _, input := range []string{"0.,4.ping,13.123;", "3.key,3.118,1.1", "invalid", "3.key,3.118,1.1;invalid"} {
		if _, _, err := FilterTunnelInstructions([]byte(input)); err == nil {
			t.Fatalf("expected invalid instruction error for %q", input)
		}
	}
}
