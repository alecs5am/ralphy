import Foundation

public enum MediaBucket: String, Codable, CaseIterable, Hashable, Sendable {
    case image
    case video
    case audio
    case text
    case other
}

public struct MediaItem: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let url: URL
    public let relativePath: String
    public let workspace: String
    public let project: String
    public let bucket: MediaBucket
    public let filename: String
    public let fileExtension: String
    public let sizeBytes: Int64
    public let createdAt: Date?
    public let modifiedAt: Date?

    public init(
        id: String,
        url: URL,
        relativePath: String,
        workspace: String,
        project: String,
        bucket: MediaBucket,
        filename: String,
        fileExtension: String,
        sizeBytes: Int64,
        createdAt: Date?,
        modifiedAt: Date?
    ) {
        self.id = id
        self.url = url
        self.relativePath = relativePath
        self.workspace = workspace
        self.project = project
        self.bucket = bucket
        self.filename = filename
        self.fileExtension = fileExtension
        self.sizeBytes = sizeBytes
        self.createdAt = createdAt
        self.modifiedAt = modifiedAt
    }
}

public struct MediaAnnotation: Codable, Equatable, Sendable {
    public var rating: Int
    public var favorite: Bool
    public var rejected: Bool
    public var tags: [String]
    public var note: String
    public var updatedAt: Date

    public init(
        rating: Int = 0,
        favorite: Bool = false,
        rejected: Bool = false,
        tags: [String] = [],
        note: String = "",
        updatedAt: Date = Date()
    ) {
        self.rating = max(0, min(5, rating))
        self.favorite = favorite
        self.rejected = rejected
        self.tags = tags
        self.note = note
        self.updatedAt = updatedAt
    }
}
