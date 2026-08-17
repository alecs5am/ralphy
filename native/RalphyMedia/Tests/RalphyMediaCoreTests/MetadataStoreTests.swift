import Foundation
import Testing
@testable import RalphyMediaCore

@Test func metadataStorePersistsAnnotationsInsideRalphyRoot() throws {
    let root = try TemporaryRalphy.make()
    var store = try MetadataStore(root: root.url)
    let path = "workspaces/nightmaker/projects/hook/artifacts/videos/shot.mp4"

    store.annotations[path] = MediaAnnotation(
        rating: 5,
        favorite: true,
        rejected: false,
        tags: ["keeper"],
        note: "Use this as the agent reference.",
        updatedAt: Date(timeIntervalSince1970: 42)
    )
    try store.save()

    let loaded = try MetadataStore(root: root.url)
    #expect(loaded.annotations[path]?.rating == 5)
    #expect(loaded.annotations[path]?.favorite == true)
    #expect(loaded.annotations[path]?.rejected == false)
    #expect(loaded.annotations[path]?.tags == ["keeper"])
    #expect(loaded.annotations[path]?.note == "Use this as the agent reference.")
    #expect(FileManager.default.fileExists(atPath: root.url.appending(path: "media-library/library.json").path))
}
