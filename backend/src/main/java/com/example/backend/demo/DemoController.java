package com.example.backend.demo;

import jakarta.validation.Valid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/demo")
public class DemoController {

    @GetMapping
    public DemoResponse getDemo() {
        return new DemoResponse("demo", "Spring Boot backend is running.");
    }

    @PostMapping("/echo")
    public DemoResponse echo(@Valid @RequestBody DemoRequest request) {
        return new DemoResponse(request.name(), "Hello, " + request.name() + "!");
    }
}
