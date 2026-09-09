import Foundation
import Testing
@testable import RalphyMediaCore

@Test func scannerIndexesWorkspaceProjectMediaAndTextFiles() throws {
    let root = try TemporaryRalphy.make()
    try root.write("workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4", bytes: [0, 1, 2])
    try root.write("workspaces/nightmaker/projects/hook/artifacts/images/card.png", bytes: [0, 1])
    try root.write("workspaces/nightmaker/projects/hook/BRIEF.md", string: "Launch hook")
    try root.write("workspaces/nightmaker/projects/hook/artifacts/fonts/display.otf", bytes: [0])

    let items = try MediaScanner().scan(root: root.url)

    #expect(items.map(\.relativePath) == [
        "workspaces/nightmaker/projects/hook/BRIEF.md",
        "workspaces/nightmaker/projects/hook/artifacts/images/card.png",
        "workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4",
    ])
    #expect(items.first { $0.filename == "shot.mp4" }?.workspace == "nightmaker")
    #expect(items.first { $0.filename == "shot.mp4" }?.project == "hook")
    #expect(items.first { $0.filename == "shot.mp4" }?.bucket == .video)
    #expect(items.first { $0.filename == "card.png" }?.bucket == .image)
    #expect(items.first { $0.filename == "BRIEF.md" }?.bucket == .text)
}

@Test func scannerRejectsNonRalphyRoot() throws {
    let folder = URL(filePath: NSTemporaryDirectory()).appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

    #expect(throws: MediaScannerError.notRalphyRoot) {
        _ = try MediaScanner().scan(root: folder)
    }
}

struct TemporaryRalphy {
    let url: URL

    static func make() throws -> TemporaryRalphy {
        let url = URL(filePath: NSTemporaryDirectory())
            .appending(path: UUID().uuidString)
            .appending(path: ".ralphy")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return TemporaryRalphy(url: url)
    }

    func write(_ relativePath: String, bytes: [UInt8]) throws {
        let fileURL = url.appending(path: relativePath)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(bytes).write(to: fileURL)
    }

    func write(_ relativePath: String, string: String) throws {
        let fileURL = url.appending(path: relativePath)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try string.write(to: fileURL, atomically: true, encoding: .utf8)
    }
}
