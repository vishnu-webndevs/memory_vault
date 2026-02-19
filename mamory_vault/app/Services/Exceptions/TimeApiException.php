<?php

namespace App\Services\Exceptions;

class TimeApiException extends \RuntimeException
{
    public function __construct(string $message, public int $status = 500)
    {
        parent::__construct($message);
    }
}
