package com.gaia3d.backend.job;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import jakarta.annotation.PreDestroy;

@Service
public class JobQueue {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public void enqueue(Long jobId, Runnable task) {
        Runnable namedTask = () -> task.run();
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(namedTask);
                }
            });
            return;
        }
        executor.execute(namedTask);
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }
}
