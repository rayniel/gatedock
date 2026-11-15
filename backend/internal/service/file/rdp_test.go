package file

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/veops/oneterm/internal/guacd"
	"github.com/veops/oneterm/internal/model"
	gsession "github.com/veops/oneterm/internal/session"
)

func TestUploadRDPFileStreamWithIDWritesOnlyToTargetDirectory(t *testing.T) {
	driveRoot := t.TempDir()
	t.Setenv("ONETERM_RDP_DRIVE_PATH", driveRoot)

	previousService := DefaultFileService
	DefaultFileService = &FileService{}
	t.Cleanup(func() { DefaultFileService = previousService })

	sessionID := "rdp-upload-target-test"
	gsession.GetOnlineSession().Store(sessionID, &gsession.Session{Session: &model.Session{SessionId: sessionID, AssetId: 7}})
	t.Cleanup(func() { gsession.GetOnlineSession().Delete(sessionID) })

	content := "uploaded content"
	err := UploadRDPFileStreamWithID(&guacd.Tunnel{SessionId: sessionID}, "transfer-test", sessionID, "/Download/report.txt", strings.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}

	assetRoot := filepath.Join(driveRoot, "asset_7")
	got, err := os.ReadFile(filepath.Join(assetRoot, "Download", "report.txt"))
	if err != nil {
		t.Fatalf("read uploaded file: %v", err)
	}
	if string(got) != content {
		t.Fatalf("uploaded content = %q, want %q", got, content)
	}
	if _, err := os.Stat(filepath.Join(assetRoot, "report.txt")); !os.IsNotExist(err) {
		t.Fatalf("unexpected file at drive root, stat error: %v", err)
	}
}
