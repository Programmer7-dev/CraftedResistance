plugins {
    application
    id("org.beryx.runtime") version "2.0.1" // Adds jpackage integration for non-modular apps
}

repositories {
    mavenCentral()
}

// Pick the LWJGL native libraries that match the machine running the build.
val os = System.getProperty("os.name").lowercase()
val arch = System.getProperty("os.arch").lowercase()
val isArm = arch.contains("aarch64") || arch.contains("arm64")
val lwjglNatives = when {
    os.startsWith("windows") -> if (isArm) "natives-windows-arm64" else "natives-windows"
    os.contains("mac")        -> if (isArm) "natives-macos-arm64" else "natives-macos"
    else                     -> if (isArm) "natives-linux-arm64" else "natives-linux"
}

dependencies {
    implementation(platform("org.lwjgl:lwjgl-bom:3.4.2"))
    implementation("org.lwjgl:lwjgl")
    implementation("org.lwjgl:lwjgl-glfw")
    implementation("org.lwjgl:lwjgl-opengl")
    implementation("org.lwjgl:lwjgl-openal")
    // only for STBVorbis: JavaSound cannot read .ogg, and the music is ~49 MB as PCM
    implementation("org.lwjgl:lwjgl-stb")

    runtimeOnly("org.lwjgl:lwjgl::$lwjglNatives")
    runtimeOnly("org.lwjgl:lwjgl-glfw::$lwjglNatives")
    runtimeOnly("org.lwjgl:lwjgl-opengl::$lwjglNatives")
    runtimeOnly("org.lwjgl:lwjgl-openal::$lwjglNatives")
    runtimeOnly("org.lwjgl:lwjgl-stb::$lwjglNatives")

    testImplementation(platform("org.junit:junit-bom:5.10.2"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile> {
    options.release.set(22)
}

tasks.test {
    useJUnitPlatform()
}

// JVM flags for running the game. GLFW must run on the first thread on macOS.
val gameJvmArgs = buildList {
    add("--enable-native-access=ALL-UNNAMED")
    if (os.contains("mac")) add("-XstartOnFirstThread")
}

tasks.withType<JavaExec>().configureEach {
    jvmArgs(gameJvmArgs)
}

application {
    mainClass.set("com.Main")
    applicationDefaultJvmArgs = gameJvmArgs
}

// --- JPackage & Runtime Configuration ---
//
// Task guide:
//   jpackageImage  - self-contained folder + launcher. No prerequisites. Works today.
//   runtimeZip     - the same thing as a zip.
//   jpackage       - builds the installer for this host: .msi on Windows, .dmg on macOS.
//                    Windows needs the WiX toolset on PATH; macOS needs Xcode command line tools.
//
// On Windows jpackage can only build a real installer if WiX is installed, and it reports
// a missing WiX as the misleading "Invalid or unsupported type: [msi]". Override the type
// with -PjpackageType=msi once WiX is on the PATH (https://wixtoolset.org).
//
// The default follows the host, because "msi" is not a valid type on macOS or Linux and
// jpackage fails on it outright rather than ignoring it. Building a .dmg therefore needs
// no -P flag at all - just run `gradlew jpackage` on the Mac.
val jpackageType = (findProperty("jpackageType") as String?)
    ?: if (os.startsWith("windows")) "msi" else if (os.contains("mac")) "dmg" else "deb"

runtime {
    // Strips unused JDK modules to keep the bundled Java runtime size small
    options.set(listOf("--strip-debug", "--compress", "2", "--no-header-files", "--no-man-pages"))

    // jdk.unsupported carries sun.misc.Unsafe, which LWJGL 3.4 loads to allocate native memory.
    // The automatic module detection here is bytecode-driven and cannot see that reflective
    // Class.forName, so it strips the module out - and then the packaged game dies on the very
    // first frame with:
    //
    //   java.lang.NoClassDefFoundError: sun/misc/Unsafe
    //     at org.lwjgl.system.MemoryBackendUnsafeLegacy.getUnsafeInstance
    //     at com.Main.main(Main.java:385)
    //
    // It only fails when running from the bundled runtime; from a full JDK the module is always
    // present, which is exactly why it survived every test run. It was in the app-image, the MSI,
    // the EXE installer and the MSIX - every shipped artifact crashed identically.
    // Calling addModules switches jlink from "detect from bytecode" to "use exactly this list", so
    // the whole set has to be named. The detected set was java.base, java.datatransfer,
    // java.desktop, java.prefs and java.xml; naming only the new module drops the other four and
    // the game then dies on the first texture load with NoClassDefFoundError: javax/imageio/ImageIO.
    // Keep this list complete - if the packaged game stops booting, this is the first thing to check.
    addModules(
        "jdk.unsupported",     // sun.misc.Unsafe, which LWJGL loads to allocate native memory
        "java.desktop",         // javax.imageio - every PNG texture load goes through this
        "java.datatransfer",    // clipboard and drag-and-drop
        "java.prefs",           // the Swing launcher's settings store
        "java.xml",
    )

    // JPackageData is a plain Groovy bean, NOT a Gradle Property wrapper, so these are plain
    // assignments. Calling .set(...) on them does not compile.
    jpackage {
        // jpackage rejects spaces in this, so it cannot be the display name.
        imageName = "CraftedResistance"
        appVersion = "1.0.0"

        // Ensures the JVM flags (like native access) carry over to the packaged executable.
        // A List<String>, so this is an assignment and not addAll either.
        jvmArgs = gameJvmArgs

        // "msix" was never a jpackage type - --type only accepts app-image, exe and msi.
        installerType = jpackageType

        // These are Windows-only jpackage flags. Passing them on macOS makes jpackage reject the
        // whole build, so they are applied only where they mean something - on Windows, where
        // they give the installed app a Start-menu entry and a desktop shortcut.
        installerOptions = if (os.startsWith("windows")) {
            listOf("--win-menu", "--win-shortcut")
        } else {
            emptyList()
        }
    }
}

// ============================ Audio compression ============================
//
// The music is uncompressed 44.1kHz stereo PCM: ~49 MB across three files, which is most of
// the jar and therefore most of the .msix. Vorbis gets that to a few MB at no perceptible loss
// for music and effects.
//
//   gradlew convertAudio
//
// Needs ffmpeg on the PATH (https://www.gyan.dev/ffmpeg/builds). The .wav files are left
// alone - processResources simply stops shipping them once a matching .ogg exists, so the
// conversion is fully reversible by deleting the .ogg.

/**
 * Every clip that ships as ogg, with the quality tier it is encoded at.
 *
 * <p>Paths are relative to the resources root, because that is what ProcessResources matches
 * its exclude patterns against. Writing "src/main/resources/Audio/FinalBoss.wav" here
 * silently excludes nothing and the jar ends up carrying both the wav and the ogg.
 *
 * <p>Two tiers on purpose. Music masks its own quantisation noise, so q6 is fine and saves the
 * most. Sound effects are short percussive transients - clicks, footsteps, a door hiss -
 * which is exactly what Vorbis pre-echo smears. q8 costs only 40 KB more across all seven
 * and keeps the attack clean.
 */
val resourceRoot = "src/main/resources"
val musicClips = listOf(
    "Audio/FinalBoss.wav" to 6,
    "Audio/FriendBot.wav" to 6,
    "rickroll.wav" to 6,
)
val sfxClips = listOf(
    "Sfx/DoorHiss.wav",
    "Sfx/ArmourEquip.wav",
    "Sfx/BlockPlace.wav",
    "Sfx/Dmg.wav",
    "Sfx/PlayerWalk+JumpLanding.wav",
    "Sfx/BlockPick.wav",
    "Sfx/UIClick.wav",
).map { it to 8 }

/** Resource-relative wav paths that must stop shipping once an .ogg exists beside them. */
val compressedAudio = (musicClips + sfxClips).map { it.first }

tasks.register("convertAudio") {
    group = "build setup"
    description = "Converts every wav clip to ogg vorbis with ffmpeg (needs ffmpeg)"
    outputs.upToDateWhen { false }
    doLast {
        var totalBefore = 0L
        var totalAfter = 0L

        (musicClips + sfxClips).forEach { (rel, quality) ->
            val wav = layout.projectDirectory.file("$resourceRoot/$rel").asFile
            if (!wav.isFile) return@forEach
            val ogg = File(wav.parentFile, wav.nameWithoutExtension + ".ogg")
            totalBefore += wav.length()

            // Prefer -Pffmpeg=<path>, else plain "ffmpeg" off the PATH. The explicit form matters
            // because Gradle inherits the PATH of whatever launched it, so a freshly installed
            // ffmpeg stays invisible until the IDE is restarted.
            val ffmpeg = providers.gradleProperty("ffmpeg").orNull ?: "ffmpeg"
            try {
                val pb = ProcessBuilder(
                    ffmpeg, "-y", "-loglevel", "error", "-i", wav.absolutePath,
                    "-c:a", "libvorbis", "-q:a", quality.toString(), ogg.absolutePath,
                ).redirectErrorStream(true)
                val proc = pb.start()
                val log = proc.inputStream.bufferedReader().readText()
                if (proc.waitFor() != 0) throw GradleException(log.ifBlank { "exit ${proc.exitValue()}" })
            } catch (e: Exception) {
                throw GradleException(
                    "ffmpeg failed on ${wav.name}.\n" +
                        "If it is not on the PATH, pass it explicitly:\n" +
                        "  gradlew convertAudio -Pffmpeg=C:/path/to/ffmpeg.exe\n" +
                        "or download it from https://www.gyan.dev/ffmpeg/builds/\n" +
                        "Cause: ${e.message}"
                )
            }

            totalAfter += ogg.length()
            val pct = if (wav.length() > 0) 100.0 * ogg.length() / wav.length() else 0.0
            logger.lifecycle(
                "${wav.name}: ${"%.1f".format(wav.length() / 1_000_000.0)} MB -> " +
                    "${"%.1f".format(ogg.length() / 1_000_000.0)} MB (${"%.0f".format(pct)}%)"
            )
        }

        if (totalBefore > 0) {
            logger.lifecycle(
                "Total: ${"%.1f".format(totalBefore / 1_000_000.0)} MB -> " +
                    "${"%.1f".format(totalAfter / 1_000_000.0)} MB " +
                    "(-${"%.1f".format((totalBefore - totalAfter) / 1_000_000.0)} MB)"
            )
        }
    }
}

// Ship the compressed version when it exists, otherwise the wav. A configuration-time check
// rather than a task dependency, because the .ogg files are committed alongside the sources
// and are not produced by anything in the build graph.
tasks.named<ProcessResources>("processResources") {
    compressedAudio.forEach { rel ->
        val wav = layout.projectDirectory.file("$resourceRoot/$rel").asFile
        val ogg = File(wav.parentFile, wav.nameWithoutExtension + ".ogg")
        if (ogg.isFile) {
            exclude(rel)
            logger.info("shipping ${ogg.name} instead of ${wav.name}")
        }
    }
}

// ============================ Native launcher ============================
//
// crlaunch is a small C program that starts the game the same way the generated
// .bat/.sh do, but as a real binary - which is what an MSIX or app-image can
// actually ship. It finds the app root from its own path, builds the classpath
// from lib/*.jar and locates a JVM (override, JAVA_HOME, a bundled jpackage
// runtime, PATH, then the usual install dirs).
//
//   gradlew launcher           compile it into build/launcher
//   gradlew installDist       the lib/ tree it expects
//   build/launcher/crlaunch   run it
//
// Needs a C compiler on PATH. This machine has none, so the task fails with an
// explanation instead of a bare "command not found".
val launcherOut = layout.buildDirectory.dir("launcher")

val crlaunch = tasks.register("crlaunch") {
    group = "build setup"
    description = "Compiles the C launcher into build/launcher"
    inputs.file(layout.projectDirectory.file("launcher/crlaunch.c"))
    outputs.dir(launcherOut)

    doLast {
        val src = layout.projectDirectory.file("launcher/crlaunch.c").asFile
        val outDir = launcherOut.get().asFile
        outDir.mkdirs()
        val exe = outDir.resolve(if (os.startsWith("windows")) "crlaunch.exe" else "crlaunch")

        // Gradle inherits the PATH of whatever launched it, so a compiler
        // installed afterwards stays invisible until the IDE is restarted.
        val override = providers.gradleProperty("cc").orNull
        // tcc first: it is a 478 KB zip rather than a multi-gigabyte toolchain,
        // and it builds this file warning-free. It does not take -std=c99.
        val candidates = if (!override.isNullOrBlank()) listOf(override) else
            if (os.startsWith("windows")) listOf("tcc", "clang", "gcc") else listOf("cc", "tcc", "clang", "gcc")

        val failures = mutableListOf<String>()
        for (cc in candidates) {
            val base = cc.substringAfterLast('/').substringAfterLast('\\')
            // -mwindows links against the GUI subsystem, so double-clicking crlaunch.exe
            // does not open a console behind it. It is Windows-only; clang/gcc on POSIX
            // would reject the flag.
            val windowsNoConsole = if (os.startsWith("windows")) listOf("-mwindows") else emptyList()
            val flags = if (base == "tcc" || base == "tcc.exe") {
                listOf("-Wall", "-Wextra")
            } else {
                listOf("-O2", "-std=c99", "-Wall", "-Wextra")
            }
            val pb = ProcessBuilder(cc, *(flags + windowsNoConsole +
                    listOf("-o", exe.absolutePath, src.absolutePath)).toTypedArray())
                .redirectErrorStream(true)
            try {
                val proc = pb.start()
                val log = proc.inputStream.bufferedReader().readText()
                val code = proc.waitFor()
                if (code == 0) {
                    logger.lifecycle("crlaunch built with $cc: $exe")
                    return@doLast
                }
                failures += "$cc exited $code${if (log.isBlank()) "" else ":\n$log"}"
            } catch (e: Exception) {
                failures += "$cc: ${e.message}"
            }
        }
        throw GradleException(
            "crlaunch: no usable C compiler on PATH (tried ${candidates.joinToString(", ")}).\n" +
                failures.joinToString("\n") { "  $it" } + "\n" +
                "Smallest option is TinyCC - a 478 KB zip, no installer:\n" +
                "  https://download.savannah.gnu.org/releases/tinycc/tcc-0.9.27-win64-bin.zip\n" +
                "Then put tcc.exe on PATH, or pass -Pcc=<full path to tcc.exe>.\n" +
                "The game itself does not need this - only the native launcher does."
        )
    }
}

// Puts the launcher next to the lib/ tree it resolves against, so the pair can
// be copied anywhere as a unit.
//
// Copy, never Sync: Sync deletes everything in the destination that it did not
// put there, which here means wiping the jars installDist just copied into lib/.
// The launcher is an addition to the install tree, not a description of it.
tasks.register<Copy>("installLauncher") {
    group = "distribution"
    description = "Copies the launcher into build/install/CraftedResistance/bin"
    dependsOn(crlaunch, tasks.named("installDist"))
    from(launcherOut) { into("bin") }
    into(layout.buildDirectory.dir("install/CraftedResistance"))
}

// ============================ browser URL scheme ============================
//
// Registers craftedresistance:// so a link in a browser starts the game.
//
// This is a convenience for an installer to call, not something a build should force: it writes
// to HKCU, which is a side effect on the developer's own machine, and a build that silently edits
// the registry is a build nobody trusts. The launcher ALSO self-registers on its first run, so
// an installed copy works with no install-time step at all - this task exists for installers
// that want it done up front.
//
//   gradlew registerProtocol
//
tasks.register("registerProtocol") {
    group = "distribution"
    description = "Registers craftedresistance:// so browser links can start the game"
    dependsOn(tasks.named("jar"))
    doLast {
        val jarFile = tasks.named<Jar>("jar").get().archiveFile.get().asFile
        val java = File(System.getProperty("java.home"), "bin/java.exe")
            .takeIf { it.exists() } ?: File(System.getProperty("java.home"), "bin/java")
        // -cp is the jar itself; the launcher classes ship inside it, so nothing else is needed
        val command = listOf(java.absolutePath, "-cp", jarFile.absolutePath,
            "com.craftedresistance.launcher.LauncherWindow", "--register-protocol")
        logger.lifecycle("registerProtocol: " + command.joinToString(" "))
        val process = ProcessBuilder(command).inheritIO().start()
        val code = process.waitFor()
        if (code != 0) {
            logger.warn("registerProtocol: exited $code - browser links will not work until it succeeds")
        }
    }
}

// ============================ GUI launcher ============================
//
// A Swing front end: install folder, save folder, Java runtime, volume, FOV,
// memory and fullscreen, then a Play button. It writes the settings file and
// starts the game in a child JVM.
//
//   gradlew launcher        run it
//
// Swing rather than the game's own GLFW renderer on purpose. The launcher has to come
// up before any OpenGL context exists, and on the machine whose GPU driver is the
// problem it still has to open - Swing draws through the desktop compositor.
val launcherMainClass = "com.craftedresistance.launcher.LauncherWindow"

val launcher = tasks.register<JavaExec>("launcher") {
    group = "application"
    description = "Runs the graphical launcher"
    mainClass.set(launcherMainClass)
    classpath = sourceSets.main.get().runtimeClasspath
    // Not headless: the whole point is a window. Only the MSIX manifest helper is.
    systemProperty("java.awt.headless", "false")
}

// One launcher, one executable.
//
// There are deliberately no .bat/.sh/.vbs scripts here. A .bat cannot be the entry point
// for something that must not show a console: cmd.exe opens one the moment the file is
// double-clicked, whatever the script goes on to run. crlaunch.exe is built with
// -mwindows and starts the JVM with CREATE_NO_WINDOW, so double-clicking it shows
// nothing but the launcher window. It replaces its own binary in place on rebuild.
//
// `gradlew installLauncher` copies it into <install>/bin next to lib/.

// ============================ MSIX game payload ============================
//
// An MSIX installs under Program Files, which Windows makes read-only for apps, so the
// game cannot unpack itself there. It ships as a single archive next to the launcher and
// is unpacked into a folder the user picks, on first run.
//
//   gameArchive  - build/payload/game.zip (or .7z when 7-Zip is installed)
//
// On the container format: 7z was the original plan and the launcher unpacks 7z correctly
// (verified against a real 107 MB 7z, 1.1 s, no 7-Zip installed). It is not the default
// here for two measured reasons: bsdtar cannot WRITE 7z, so a .7z payload needs 7-Zip
// installed to build; and zip needs no external tool at all, because the launcher unpacks
// it with Java's own reader. Nor does the container save space - the jars are already
// deflated, so 103.8 MB came back out of 7z as 103.7 MB. What it buys is a single opaque
// file the MSIX packer can treat as data instead of scattering into Program Files.
val gameArchive = tasks.register("gameArchive") {
    group = "distribution"
    description = "Packs the game's lib folder into a single archive for first-run install"
    // installLauncher too, not just installDist: both write into build/install, so without
    // this Gradle cannot order them and either may run first.
    dependsOn(tasks.named("installDist"), tasks.named("installLauncher"))

    val libDir = layout.buildDirectory.dir("install/CraftedResistance/lib")
    val outFile = layout.buildDirectory.file("payload/game.zip")
    outputs.file(outFile)
    inputs.dir(libDir)

    doLast {
        val lib = libDir.get().asFile
        val root = lib.parentFile          // the install tree, containing "lib"
        val out = outFile.get().asFile
        out.parentFile.mkdirs()
        out.delete()

        // Two measured facts drive this, both checked on this machine:
        //
        //  - bsdtar (the tar.exe in Windows) READS 7z but cannot WRITE it: `--format=7zip`
        //    produced a 0-byte file. It CAN write zip.
        //  - 7-Zip, when installed, can write either.
        //
        // So the default is a zip: it needs no third-party tool to build and, more to the
        // point, the launcher unpacks it with Java's own zip reader and no external process
        // at all. 7-Zip is used for a .7z payload when it happens to be installed, and the
        // launcher unpacks 7z either way.
        //
        // ProcessBuilder rather than exec {} because this runs inside doLast. The working
        // directory is set rather than using tar's -C, which fails here with
        // "Couldn't visit directory" regardless of the path given.
        val sevenZip = listOf("C:/Program Files/7-Zip/7z.exe", "C:/Program Files (x86)/7-Zip/7z.exe")
            .map { File(it) }.firstOrNull { it.isFile }

        val command = if (sevenZip != null) {
            listOf(sevenZip.absolutePath, "a", "-t7z", "-mx=1", "-y", out.absolutePath, "lib")
        } else {
            listOf("tar", "--format=zip", "-cf", out.absolutePath, "lib")
        }

        val proc = ProcessBuilder(command)
            .directory(root)
            .redirectErrorStream(true)
            .start()
        val log = proc.inputStream.bufferedReader().readText()
        val code = proc.waitFor()
        if (code != 0 || !out.isFile || out.length() == 0L) {
            throw GradleException(
                "gameArchive failed (exit $code):\n$log\n" +
                    "Needs tar.exe (bundled with Windows 10/11) or 7-Zip on the PATH."
            )
        }
        logger.lifecycle("game archive: ${out.absolutePath} (${out.length() / 1024 / 1024} MB)")
    }
}

// Stages the launcher plus the payload the way an MSIX lays them out: launcher and
// game.7z side by side, nothing extracted yet.
tasks.register<Sync>("msixLauncherPayload") {
    group = "distribution"
    description = "Stages the launcher and game.7z for packaging"
    dependsOn(tasks.named("installLauncher"), gameArchive)
    into(layout.buildDirectory.dir("msix/launcher"))
    from(launcherOut) {
        include("crlaunch*")
    }
    from(gameArchive)
}

// ============================ MSIX packaging ============================
//
// jpackage cannot emit MSIX - --type only accepts app-image, exe and msi. So the package is
// built the other way round: jpackage produces the app-image (minimal jlink runtime plus the
// launcher), and makeappx from the Windows SDK packs that image into an MSIX.
//
//   msixKeygen  - one-off self-signed code-signing certificate
//   msixPack    - build the .msix (unsigned)
//   msixSign    - sign it, so Windows will install it
//   msixInstall - install and launch the result
//
// Gradle properties:
//   -PmsixSdkDir=<dir>   use a specific Windows SDK bin directory
//   -PmsixPfx=<file>     certificate to sign with
//   -PmsixPfxPassword=<pw>

val msixName = "CraftedResistance"
val msixVersion = "1.0.0.0"
val msixPublisher = "CN=CraftedResistance"
val msixPfxPassword = (findProperty("msixPfxPassword") as String?) ?: "craftedresistance"

val msixToolsDir = layout.buildDirectory.dir("msix/tools")
val msixLayoutDir = layout.buildDirectory.dir("msix/layout")
val msixOutput = layout.buildDirectory.file("msix/$msixName.msix")
val msixPfx = layout.buildDirectory.file("msix/cert/$msixName.pfx")

/**
 * Finds the SDK packaging tools and stages them somewhere executable.
 *
 * <p>Delegated to PowerShell: the MSIX Packaging Tool keeps its copies under
 * C:\Program Files\WindowsApps, a folder that cannot be listed or executed from by a normal
 * process. Only Get-AppxPackage can resolve that install location.
 */
val msixTools = tasks.register<Exec>("msixTools") {
    group = "msix"
    description = "Locates and stages makeappx.exe / signtool.exe"
    val override = providers.gradleProperty("msixSdkDir").orNull
    inputs.property("sdkOverride", override ?: "")
    outputs.dir(msixToolsDir)
    doFirst {
        executable("powershell")
        args(
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", layout.projectDirectory.file("gradle/msix-tools.ps1").asFile.absolutePath,
            "-OutDir", msixToolsDir.get().asFile.absolutePath,
        )
        if (!override.isNullOrBlank()) args("-SdkDir", override)
    }
}

/** Copies the jpackage app-image into the package layout. */
val msixImage = tasks.register<Sync>("msixImage") {
    group = "msix"
    description = "Copies the jpackage app-image into the MSIX layout"
    dependsOn("jpackageImage")
    from(layout.buildDirectory.dir("jpackage/$msixName"))
    into(msixLayoutDir)
    exclude("app/.jpackage.xml")   // jpackage bookkeeping, not payload
}

/** Writes AppxManifest.xml and the logo assets it references. */
val msixManifest = tasks.register<JavaExec>("msixManifest") {
    group = "msix"
    description = "Generates AppxManifest.xml and the MSIX logo assets"
    dependsOn(msixImage)
    mainClass.set("com.craftedresistance.tools.MsixLayout")
    classpath = sourceSets.main.get().runtimeClasspath
    systemProperty("java.awt.headless", "true")
    args(
        msixLayoutDir.get().asFile.absolutePath,
        msixName,
        msixPublisher,
        msixVersion,
        file("src/main/resources/Logo.png").absolutePath,
    )
}

val msixPack = tasks.register<Exec>("msixPack") {
    group = "msix"
    description = "Packs the layout into an unsigned .msix"
    dependsOn(msixManifest, msixTools)
    executable(msixToolsDir.get().asFile.resolve("makeappx.exe").absolutePath)
    args(
        "pack",
        "/d", msixLayoutDir.get().asFile.absolutePath,
        "/p", msixOutput.get().asFile.absolutePath,
        "/o",                 // overwrite without asking
        "/h", "SHA256",
    )
}

/**
 * A ten-year self-signed code-signing certificate.
 *
 * <p>MSIX will not install an unsigned package, and a self-signed one is only trusted on
 * machines where the certificate has been added to Trusted People - which msixKeygen does for
 * the current user. Fine for sideloading your own build; use a real code-signing cert to
 * distribute.
 */
// The PowerShell lives in gradle/*.ps1 rather than inline in this script: embedding a shell
// script in a Kotlin string means fighting $ interpolation at every line, and the error messages
// are useless when you get it wrong.
val msixKeygen = tasks.register<Exec>("msixKeygen") {
    group = "msix"
    description = "Creates a self-signed code-signing certificate and trusts it"
    outputs.file(msixPfx)
    doFirst {
        executable("powershell")
        args(
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", layout.projectDirectory.file("gradle/msix-keygen.ps1").asFile.absolutePath,
            "-Subject", msixPublisher,
            "-PfxPath", msixPfx.get().asFile.absolutePath,
            "-Password", msixPfxPassword,
        )
    }
}

val msixSign = tasks.register<Exec>("msixSign") {
    group = "msix"
    description = "Signs the .msix so Windows will install it"
    dependsOn(msixPack, msixTools, msixKeygen)
    val pfxOverride = providers.gradleProperty("msixPfx").orNull
    executable(msixToolsDir.get().asFile.resolve("signtool.exe").absolutePath)

    // Deliberately no inputs.file/outputs.file on the .msix: signing rewrites the file the
    // packer just produced, so declaring it as both input and output makes the two tasks
    // fight over it. Gradle 9 also validates declared inputs before dependencies run, which
    // fails outright on a freshly-cloned tree. The packer is the real dependency here.
    inputs.property("msix", msixOutput.get().asFile.absolutePath)
    inputs.property("pfx", pfxOverride ?: msixPfx.get().asFile.absolutePath)
    outputs.upToDateWhen { false }   // always re-sign

    doFirst {
        val cert = pfxOverride ?: msixPfx.get().asFile.absolutePath
        // No /n here: it filters by subject name, and the cert's CN is "CraftedResistance",
        // so any display name would make signtool report "no certificates met the criteria".
        args(
            "sign",
            "/fd", "SHA256",
            "/f", cert,
            "/p", msixPfxPassword,
            msixOutput.get().asFile.absolutePath,
        )
    }
}

val msixInstall = tasks.register<Exec>("msixInstall") {
    group = "msix"
    description = "Installs the signed .msix for the current user"
    dependsOn(msixSign)
    doFirst {
        // the AppUserModelId is Publisher!ApplicationId, both pinned by the manifest
        executable("powershell")
        args(
            "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-File", layout.projectDirectory.file("gradle/msix-install.ps1").asFile.absolutePath,
            "-MsixPath", msixOutput.get().asFile.absolutePath,
            "-Aumid", "${msixPublisher}!${msixName}.App",
        )
    }
}

/**
 * Adds the signing certificate to the MACHINE root store.
 *
 * <p>Separate from msixKeygen because it needs an elevated shell. Add-AppxPackage validates a
 * package signature against LocalMachine\Root, not the per-user store, so trusting the
 * certificate for the current user is not enough - the install still fails with 0x800B0109.
 */
val msixTrust = tasks.register<Exec>("msixTrust") {
    group = "msix"
    description = "Trusts the signing certificate machine-wide (requires an elevated shell)"
    dependsOn(msixKeygen)
    val cerPath = msixPfx.map { it.asFile.absolutePath.replace(".pfx", ".cer") }
    inputs.property("cer", cerPath)
    outputs.upToDateWhen { false }

    doFirst {
        // "net session" only succeeds in an elevated session. Cheaper to ask certutil and
        // let it complain, but the message is opaque, so check first and say something useful.
        val elevated = try {
            ProcessBuilder("net", "session").redirectErrorStream(true).start()
                .let { it.inputStream.bufferedReader().readText() }.contains("Active")
        } catch (e: Exception) {
            false
        }
        if (!elevated) {
            throw GradleException(
                "msixTrust needs an elevated shell: it writes to Cert:\\LocalMachine\\Root.\n" +
                    "Re-run as Administrator, or import ${cerPath.get()} into\n" +
                    "Trusted Root Certification Authorities by hand."
            )
        }
        executable("certutil")
        args("-addstore", "Root", cerPath.get())
    }
}
