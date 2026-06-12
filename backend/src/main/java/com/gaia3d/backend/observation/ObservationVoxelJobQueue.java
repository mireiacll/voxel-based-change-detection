package com.gaia3d.backend.observation;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import jakarta.annotation.PreDestroy;

@Service
public class ObservationVoxelJobQueue {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ObservationVoxelJobRunner runner;

    public ObservationVoxelJobQueue(ObservationVoxelJobRunner runner) {
        this.runner = runner;
    }

    public void enqueue(Long observationId, VoxelizeRequest request) {
        VoxelizeRequest safeRequest = request == null ? new VoxelizeRequest(null, null, null, null, null) : request;
        Runnable task = () -> runner.run(observationId, safeRequest);
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(task);
                }
            });
            return;
        }
        executor.execute(task);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
