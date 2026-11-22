# FaceTrack official-product bundle

ActivityWatch is an independent upstream project, not a FaceTrack tracking engine. Bundle its unmodified v0.14.3 Windows ZIP, preserving all files and upstream notices. Source: https://github.com/ActivityWatch/activitywatch/tree/v0.14.3 . Component revisions and archive hashes are in dependencies.lock.json.

Inspected first-party ActivityWatch repositories use MPL-2.0. The classic official package also contains Python/PyQt/Qt and native dependencies with their own license obligations, including GPL/commercial licensing considerations. The top-level MPL license is not a blanket license for that entire archive. Preserve license texts and supply required corresponding source/notices for the exact shipped release. Record a transitive SBOM and legal/compliance decision before redistribution; this document does not certify completion.

Node.js official v24.22.3 Windows distribution: https://nodejs.org/dist/v24.22.3/ . Preserve its LICENSE and bundled third-party notices. FaceTrack bundles the runtime unchanged; users do not need to install Node or Python manually.

The FaceTrack desktop status application is published self-contained with the Microsoft .NET 8 runtime. .NET runtime source and license information are available at https://github.com/dotnet/runtime under the MIT license with separately identified third-party notices. Preserve the exact runtime license and notices in a release bundle.

NSIS is used only to build the Windows installer container. NSIS is primarily under the zlib/libpng license and permits commercial applications; this build uses its zlib compression module. Its official license is https://nsis.sourceforge.io/License . The compiler is a build prerequisite, not an employee prerequisite.

No ShareX/Greenshot capture component is bundled. No ActivityWatch branding/trademark endorsement is implied.
