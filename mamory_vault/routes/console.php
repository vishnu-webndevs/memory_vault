<?php

use App\Models\User;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('auth:user {email} {--name=} {--password=} {--token}', function (string $email) {
    $name = $this->option('name') ?: 'Auth User';
    $password = $this->option('password') ?: Str::random(12);

    $user = User::updateOrCreate(
        ['email' => $email],
        ['name' => $name, 'password' => $password, 'email_verified_at' => now()]
    );

    $this->info('User ID: '.$user->id);
    $this->info('Email: '.$user->email);
    $this->info('Password: '.$password);

    if ($this->option('token')) {
        $token = $user->createToken('cli')->plainTextToken;
        $this->info('Token: '.$token);
    }
})->purpose('Create or update an authentication user');
