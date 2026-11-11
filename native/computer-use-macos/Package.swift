// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "MarkovComputerUseMacOS",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "MarkovComputerUseMacOSCore",
            targets: ["MarkovComputerUseMacOSCore"]
        ),
        .executable(
            name: "markov-computer-use-macos",
            targets: ["MarkovComputerUseMacOS"]
        )
    ],
    targets: [
        .target(
            name: "MarkovComputerUseMacOSCore",
            path: "Sources/MarkovComputerUseMacOSCore"
        ),
        .executableTarget(
            name: "MarkovComputerUseMacOS",
            dependencies: ["MarkovComputerUseMacOSCore"],
            path: "Sources/MarkovComputerUseMacOS"
        ),
        .testTarget(
            name: "MarkovComputerUseMacOSTests",
            dependencies: ["MarkovComputerUseMacOSCore"],
            path: "Tests/MarkovComputerUseMacOSTests"
        )
    ]
)
