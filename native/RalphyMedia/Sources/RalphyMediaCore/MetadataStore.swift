import Foundation

public struct MetadataStore: Sendable {
    public private(set) var root: URL
    public var annotations: [String: MediaAnnotation]

    private var fileURL: URL {
        root.appending(path: "media-library/library.json")
    }

    public init(root: URL) throws {
        let standardizedRoot = root.standardizedFileURL
        let metadataURL = standardizedRoot.appending(path: "media-library/library.json")
        self.root = standardizedRoot
        if FileManager.default.fileExists(atPath: metadataURL.path) {
            let data = try Data(contentsOf: metadataURL)
            self.annotations = try JSONDecoder.iso8601Decoder.decode(Payload.self, from: data).annotations
        } else {
            self.annotations = [:]
        }
    }

    public func save() throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try JSONEncoder.pretty.encode(Payload(annotations: annotations))
        try data.write(to: fileURL, options: [.atomic])
    }
}

private struct Payload: Codable {
    var annotations: [String: MediaAnnotation]
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension JSONDecoder {
    static var iso8601Decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
