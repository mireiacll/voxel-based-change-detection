package com.gaia3d.backend.voxelizer;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class VoxelizerProcessService {

    private static final Logger log = LoggerFactory.getLogger(VoxelizerProcessService.class);

    private final VoxelizerCommandService commandService;
    private final Map<Long, Process> runningProcesses = new ConcurrentHashMap<>();

    public VoxelizerProcessService(VoxelizerCommandService commandService) {
        this.commandService = commandService;
    }

    public VoxelizerProcessResult run(List<String> command, Path logPath) throws IOException, InterruptedException {
        return run(null, command, logPath);
    }

    public VoxelizerProcessResult run(Long jobId, List<String> command, Path logPath) throws IOException, InterruptedException {
        Files.createDirectories(logPath.toAbsolutePath().normalize().getParent());
        String displayCommand = commandService.toDisplayCommand(command);
        Instant startedAt = Instant.now();

        log.info("[voxelizer] starting command: {}", displayCommand);
        log.info("[voxelizer] process log: {}", logPath.toAbsolutePath().normalize());

        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);

        Process process = processBuilder.start();
        if (jobId != null) {
            runningProcesses.put(jobId, process);
        }
        try {
            StringBuilder output = new StringBuilder();
            try (BufferedWriter writer = Files.newBufferedWriter(logPath);
                    var reader = process.inputReader()) {
                writer.write("$ " + displayCommand);
                writer.newLine();
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append(System.lineSeparator());
                    writer.write(line);
                    writer.newLine();
                    log.info("[voxelizer] {}", line);
                }
            }

            int exitCode = process.waitFor();
            Duration elapsed = Duration.between(startedAt, Instant.now());
            log.info("[voxelizer] finished exitCode={} elapsed={}s", exitCode, elapsed.toSeconds());

            return new VoxelizerProcessResult(exitCode, output.toString().trim(), elapsed);
        } finally {
            if (jobId != null) {
                runningProcesses.remove(jobId);
            }
        }
    }

    public boolean cancel(Long jobId) {
        Process process = runningProcesses.remove(jobId);
        if (process == null) {
            return false;
        }
        process.destroyForcibly();
        return true;
    }

    public record VoxelizerProcessResult(int exitCode, String output, Duration elapsed) {

        public boolean succeeded() {
            return exitCode == 0;
        }
    }
}
