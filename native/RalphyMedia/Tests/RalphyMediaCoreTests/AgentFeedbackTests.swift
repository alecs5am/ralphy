import Foundation
import Testing
@testable import RalphyMediaCore

@Test func feedbackMarkdownIncludesSelectedFileContextAndVerdicts() throws {
    let root = URL(filePath: "/tmp/example/.ralphy")
    let item = MediaItem(
        id: "workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4",
        url: root.appending(path: "workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4"),
        relativePath: "workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4",
        workspace: "nightmaker",
        project: "hook",
        bucket: .video,
        filename: "shot.mp4",
        fileExtension: "mp4",
        sizeBytes: 1200,
        createdAt: nil,
        modifiedAt: nil
    )
    let annotation = MediaAnnotation(
        rating: 2,
        favorite: false,
        rejected: true,
        tags: ["slop", "bad-motion"],
        note: "Hands melt during the courier shot.",
        updatedAt: Date(timeIntervalSince1970: 1)
    )

    let markdown = AgentFeedback.render(items: [item], annotations: [item.relativePath: annotation])

    #expect(markdown.contains("Copy for Agent"))
    #expect(markdown.contains("nightmaker / hook"))
    #expect(markdown.contains("workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4"))
    #expect(markdown.contains("rating: 2/5"))
    #expect(markdown.contains("rejected: yes"))
    #expect(markdown.contains("tags: slop, bad-motion"))
    #expect(markdown.contains("Hands melt during the courier shot."))
}
