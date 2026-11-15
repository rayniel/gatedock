package protocols

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/veops/oneterm/internal/model"
	gsession "github.com/veops/oneterm/internal/session"
)

func TestReadGuacdHandlesTunnelPingWithoutForwardingIt(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ready := make(chan *gsession.Session, 1)
	done := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := Upgrader.Upgrade(w, r, nil)
		if err != nil {
			done <- err
			return
		}
		defer ws.Close()
		sess := &gsession.Session{
			Session: &model.Session{Protocol: "rdp:3389", SessionType: model.SESSIONTYPE_WEB},
			Ws:      ws,
			Gctx:    ctx,
			Chans: &gsession.SessionChans{
				InChan:   make(chan []byte, 4),
				AwayChan: make(chan struct{}),
			},
		}
		defer sess.StopIdle()
		ready <- sess
		done <- Read(sess)
	}))
	defer server.Close()

	client, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	var sess *gsession.Session
	select {
	case sess = <-ready:
	case err := <-done:
		t.Fatal(err)
	case <-time.After(3 * time.Second):
		t.Fatal("server did not establish the session")
	}

	ping := "0.,4.ping,13.1731680000000;"
	key := "3.key,3.118,1.1;"
	if err := client.WriteMessage(websocket.TextMessage, []byte(ping+key)); err != nil {
		t.Fatal(err)
	}
	if err := client.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatal(err)
	}
	_, reply, err := client.ReadMessage()
	if err != nil {
		t.Fatalf("read ping response: %v", err)
	}
	if string(reply) != ping {
		t.Fatalf("ping response = %q, want %q", reply, ping)
	}
	select {
	case input := <-sess.Chans.InChan:
		if string(input) != key {
			t.Fatalf("forwarded input = %q, want only %q", input, key)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("keyboard input was not forwarded")
	}
	if err := client.WriteMessage(websocket.TextMessage, []byte(ping)); err != nil {
		t.Fatal(err)
	}
	_, reply, err = client.ReadMessage()
	if err != nil || string(reply) != ping {
		t.Fatalf("second ping response = %q, error = %v", reply, err)
	}
	select {
	case input := <-sess.Chans.InChan:
		t.Fatalf("tunnel ping leaked to guacd: %q", input)
	default:
	}
	cancel()
	client.Close()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("session reader did not stop")
	}
}
